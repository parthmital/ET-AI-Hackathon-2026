from __future__ import annotations

from datetime import datetime, timezone
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
import json
import logging
import random
import re
import time
import unicodedata
from typing import Any, Protocol

import httpx

from app.settings import Settings
from app.services.terminal_logging import log_blob, log_event

TEXT_TRANSLATION = str.maketrans(
    {
        "\u00a0": " ",
        "\u202f": " ",
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2212": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
    }
)

LOGGER = logging.getLogger(__name__)
RETRYABLE_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}
RETRY_AFTER_PATTERN = re.compile(
    r"(?:retry|try)\s+again\s+in\s+([0-9]+(?:\.[0-9]+)?)\s*s",
    re.IGNORECASE,
)
DIAGNOSTIC_TEXT_LIMIT = 8000
LAST_LLM_ERROR: dict[str, Any] | None = None


def prompt_with_json_schema(system_prompt: str, schema: dict[str, Any] | None) -> str:
    if not schema:
        return system_prompt
    rendered_schema = json.dumps(
        schema,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    return (
        f"{system_prompt.rstrip()}\n\n"
        "Return JSON that matches this JSON Schema exactly. Use every required field "
        "and do not add fields outside the schema:\n"
        f"{rendered_schema}"
    )


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    api_key: str
    base_url: str
    model: str


class LLMProvider(Protocol):
    def answer(self, question: str, context: list[dict[str, Any]]) -> str: ...
    def complete_text(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
    ) -> str: ...
    def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
        schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...


class LLMConfigurationError(RuntimeError):
    pass


class LLMProviderError(RuntimeError):
    def __init__(
        self,
        public_message: str,
        *,
        diagnostics: str = "",
        status_code: int | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(public_message)
        self.public_message = public_message
        self.diagnostics = diagnostics
        self.status_code = status_code
        self.retryable = retryable


class DeepSeekProvider:
    def __init__(self, config: ProviderConfig) -> None:
        self.api_key = config.api_key
        self.base_url = config.base_url.rstrip("/")
        self.model = config.model
        self.provider_name = config.name
        log_event(
            LOGGER,
            "llm.provider.init",
            provider=self.provider_name,
            base_url=self.base_url,
            model=self.model,
            api_key_configured=bool(self.api_key),
        )

    def answer(self, question: str, context: list[dict[str, Any]]) -> str:
        log_blob(
            LOGGER,
            "llm.answer.start",
            {"question": question, "context": context},
            provider=self.provider_name,
            model=self.model,
        )
        context_text = "\n\n".join(item["text"] for item in context)
        result = self.complete_text(
            (
                "Answer only from the provided industrial evidence. Refuse unsupported claims. "
                "Use Indian English. Use plain text only, with no markdown, tables, or headings. "
                "Use proper sentence casing. Preserve asset IDs, acronyms, filenames, and quoted evidence exactly. "
                "Keep the answer under 180 words and use ASCII punctuation."
            ),
            f"Question: {question}\n\nEvidence:\n{context_text}",
        )
        log_blob(
            LOGGER,
            "llm.answer.finish",
            result,
            provider=self.provider_name,
            model=self.model,
        )
        return result

    def complete_text(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
    ) -> str:
        log_blob(
            LOGGER,
            "llm.complete_text.start",
            {"system_prompt": system_prompt, "user_prompt": user_prompt},
            provider=self.provider_name,
            model=self.model,
            max_tokens=max_tokens,
        )
        result = self._completion_text(system_prompt, user_prompt, max_tokens)
        log_blob(
            LOGGER,
            "llm.complete_text.finish",
            result,
            provider=self.provider_name,
            model=self.model,
        )
        return result

    def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
        schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        log_blob(
            LOGGER,
            "llm.complete_json.start",
            {
                "system_prompt": system_prompt,
                "user_prompt": user_prompt,
                "schema": schema,
            },
            provider=self.provider_name,
            model=self.model,
            max_tokens=max_tokens,
            json_attempts=Settings.llm_json_attempts(),
        )
        last_error: Exception | None = None
        for attempt in range(1, Settings.llm_json_attempts() + 1):
            log_event(
                LOGGER,
                "llm.complete_json.attempt.start",
                provider=self.provider_name,
                model=self.model,
                attempt=attempt,
                max_attempts=Settings.llm_json_attempts(),
            )
            content = self._complete_json_text(
                system_prompt, user_prompt, max_tokens, schema=schema
            )
            log_blob(
                LOGGER,
                "llm.complete_json.raw_content",
                content,
                provider=self.provider_name,
                model=self.model,
                attempt=attempt,
            )
            try:
                parsed = parse_json_object(content)
                log_blob(
                    LOGGER,
                    "llm.complete_json.parsed",
                    parsed,
                    provider=self.provider_name,
                    model=self.model,
                    attempt=attempt,
                )
                return parsed
            except RuntimeError as exc:
                last_error = exc
                LOGGER.warning(
                    "LLM JSON parse failed on attempt %s/%s. error=%s content=%s",
                    attempt,
                    Settings.llm_json_attempts(),
                    exc,
                    content,
                )
            repaired = self._complete_json_text(
                "Return only one valid JSON object. Do not include markdown or explanation.",
                f"Convert this model response into valid JSON without adding facts:\n{content}",
                max_tokens,
                schema=schema,
            )
            log_blob(
                LOGGER,
                "llm.complete_json.repaired_raw_content",
                repaired,
                provider=self.provider_name,
                model=self.model,
                attempt=attempt,
            )
            try:
                parsed = parse_json_object(repaired)
                log_blob(
                    LOGGER,
                    "llm.complete_json.repaired_parsed",
                    parsed,
                    provider=self.provider_name,
                    model=self.model,
                    attempt=attempt,
                )
                return parsed
            except RuntimeError as exc:
                last_error = exc
                LOGGER.warning(
                    "LLM JSON repair failed on attempt %s/%s. error=%s repaired_content=%s",
                    attempt,
                    Settings.llm_json_attempts(),
                    exc,
                    repaired,
                )

        raise LLMProviderError(
            "LLM returned invalid structured output after retries. Try again.",
            diagnostics=f"Last JSON validation error: {last_error}",
            retryable=True,
        )

    def _complete_json_text(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None,
        schema: dict[str, Any] | None = None,
    ) -> str:
        log_event(
            LOGGER,
            "llm.complete_json_text.start",
            provider=self.provider_name,
            model=self.model,
            schema_enabled=bool(schema and Settings.llm_json_schema_enabled()),
        )
        response_formats: list[dict[str, Any]] = [{"type": "json_object"}]
        for response_format in response_formats:
            request_system_prompt = (
                system_prompt
                if response_format.get("type") == "json_schema"
                else prompt_with_json_schema(system_prompt, schema)
            )
            log_blob(
                LOGGER,
                "llm.complete_json_text.response_format_attempt",
                response_format,
                provider=self.provider_name,
                model=self.model,
            )
            try:
                result = self._completion_text(
                    request_system_prompt,
                    user_prompt,
                    max_tokens,
                    response_format=response_format,
                )
                log_blob(
                    LOGGER,
                    "llm.complete_json_text.finish",
                    result,
                    provider=self.provider_name,
                    model=self.model,
                    response_format=response_format,
                )
                return result
            except LLMProviderError as exc:
                if exc.status_code != 400:
                    raise
                LOGGER.info(
                    "LLM rejected structured response format; trying fallback. provider=%s model=%s diagnostics=%s",
                    self.provider_name,
                    self.model,
                    exc.diagnostics,
                )
        result = self._completion_text(
            prompt_with_json_schema(system_prompt, schema),
            user_prompt,
            max_tokens,
        )
        log_blob(
            LOGGER,
            "llm.complete_json_text.finish_without_response_format",
            result,
            provider=self.provider_name,
            model=self.model,
        )
        return result

    def _completion_text(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        last_error: LLMProviderError | None = None
        max_output_attempts = Settings.llm_output_attempts()
        for output_attempt in range(1, max_output_attempts + 1):
            log_event(
                LOGGER,
                "llm.completion_text.output_attempt.start",
                provider=self.provider_name,
                model=self.model,
                output_attempt=output_attempt,
                max_output_attempts=max_output_attempts,
                response_format=response_format,
            )
            payload = self._post_completion(
                system_prompt,
                user_prompt,
                max_tokens,
                response_format=response_format,
            )
            log_blob(
                LOGGER,
                "llm.completion_text.provider_payload",
                payload,
                provider=self.provider_name,
                model=self.model,
                output_attempt=output_attempt,
            )
            try:
                text = extract_completion_text(payload)
                log_blob(
                    LOGGER,
                    "llm.completion_text.extracted_text",
                    text,
                    provider=self.provider_name,
                    model=self.model,
                    output_attempt=output_attempt,
                )
                return text
            except LLMProviderError as exc:
                last_error = exc
                if not exc.retryable or output_attempt >= max_output_attempts:
                    raise
                delay = retry_delay(output_attempt)
                LOGGER.warning(
                    "LLM response payload was not usable; retrying in %.2fs. output_attempt=%s/%s diagnostics=%s",
                    delay,
                    output_attempt,
                    max_output_attempts,
                    exc.diagnostics,
                )
                time.sleep(delay)
        raise last_error or LLMProviderError(
            "LLM response did not contain generated text. Try again.",
            retryable=True,
        )

    def _post_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.api_key:
            raise LLMConfigurationError(
                "DEEPSEEK_API_KEY is required for generated answers and analysis."
            )
        body: dict[str, Any] = {
            "model": self.model,
            "messages": self._messages(system_prompt, user_prompt),
            "temperature": 0.2,
        }
        body["thinking"] = {"type": "disabled"}
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        if response_format:
            body["response_format"] = response_format
        url = f"{self.base_url}/chat/completions"
        max_attempts = Settings.llm_max_attempts()
        for attempt in range(1, max_attempts + 1):
            started_at = time.perf_counter()
            log_blob(
                LOGGER,
                "llm.http.request.body",
                body,
                provider=self.provider_name,
                model=self.model,
                url=url,
                attempt=attempt,
                max_attempts=max_attempts,
            )
            log_blob(
                LOGGER,
                "llm.http.request.headers",
                {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                provider=self.provider_name,
                model=self.model,
                url=url,
                attempt=attempt,
                max_attempts=max_attempts,
                api_key_present=bool(self.api_key),
            )
            try:
                response = httpx.post(
                    url,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=body,
                    timeout=Settings.llm_timeout_seconds(),
                )
            except (
                httpx.TimeoutException,
                httpx.NetworkError,
                httpx.ProtocolError,
            ) as exc:
                retryable = True
                diagnostics = request_diagnostics(
                    provider=self.provider_name,
                    model=self.model,
                    url=url,
                    attempt=attempt,
                    max_attempts=max_attempts,
                    max_tokens=max_tokens,
                    response_format=response_format,
                    elapsed_seconds=time.perf_counter() - started_at,
                    error_type=type(exc).__name__,
                    error_detail=str(exc),
                )
                if attempt < max_attempts:
                    delay = retry_delay(attempt)
                    LOGGER.warning(
                        "LLM request transport failure; retrying in %.2fs. %s",
                        delay,
                        diagnostics,
                    )
                    time.sleep(delay)
                    continue
                LOGGER.error(
                    "LLM request transport failure after retries. %s", diagnostics
                )
                raise LLMProviderError(
                    "LLM provider connection failed after retries. Try again.",
                    diagnostics=diagnostics,
                    retryable=retryable,
                ) from exc

            elapsed_seconds = time.perf_counter() - started_at
            response_text = response.text
            log_blob(
                LOGGER,
                "llm.http.response.raw",
                response_text,
                provider=self.provider_name,
                model=self.model,
                url=url,
                attempt=attempt,
                max_attempts=max_attempts,
                status_code=response.status_code,
                response_headers=safe_response_headers(response),
                elapsed_seconds=round(elapsed_seconds, 3),
            )
            if response.status_code >= 400:
                retryable = response.status_code in RETRYABLE_STATUS_CODES
                diagnostics = request_diagnostics(
                    provider=self.provider_name,
                    model=self.model,
                    url=url,
                    attempt=attempt,
                    max_attempts=max_attempts,
                    max_tokens=max_tokens,
                    response_format=response_format,
                    elapsed_seconds=elapsed_seconds,
                    status_code=response.status_code,
                    response_headers=safe_response_headers(response),
                    response_body=response_text,
                )
                if retryable and attempt < max_attempts:
                    delay = retry_delay(attempt, response, response_text)
                    LOGGER.warning(
                        "LLM request failed with HTTP %s; retrying in %.2fs. %s",
                        response.status_code,
                        delay,
                        diagnostics,
                    )
                    time.sleep(delay)
                    continue
                LOGGER.error(
                    "LLM request failed after retries or non-retryable status. %s",
                    diagnostics,
                )
                raise LLMProviderError(
                    public_message_for_status(response.status_code, retryable),
                    diagnostics=diagnostics,
                    status_code=response.status_code,
                    retryable=retryable,
                )

            try:
                payload = response.json()
                log_blob(
                    LOGGER,
                    "llm.http.response.json",
                    payload,
                    provider=self.provider_name,
                    model=self.model,
                    url=url,
                    attempt=attempt,
                    status_code=response.status_code,
                    elapsed_seconds=round(elapsed_seconds, 3),
                )
                return payload
            except ValueError as exc:
                diagnostics = request_diagnostics(
                    provider=self.provider_name,
                    model=self.model,
                    url=url,
                    attempt=attempt,
                    max_attempts=max_attempts,
                    max_tokens=max_tokens,
                    response_format=response_format,
                    elapsed_seconds=elapsed_seconds,
                    status_code=response.status_code,
                    response_headers=safe_response_headers(response),
                    response_body=response_text,
                    error_type=type(exc).__name__,
                    error_detail=str(exc),
                )
                if attempt < max_attempts:
                    delay = retry_delay(attempt)
                    LOGGER.warning(
                        "LLM provider returned non-JSON response; retrying in %.2fs. %s",
                        delay,
                        diagnostics,
                    )
                    time.sleep(delay)
                    continue
                LOGGER.error(
                    "LLM provider returned non-JSON response after retries. %s",
                    diagnostics,
                )
                raise LLMProviderError(
                    "LLM provider returned an unreadable response after retries. Try again.",
                    diagnostics=diagnostics,
                    retryable=True,
                ) from exc

        raise LLMProviderError(
            "LLM request failed after retries. Try again.",
            diagnostics="Retry loop exited without a provider response.",
            retryable=True,
        )

    def _messages(self, system_prompt: str, user_prompt: str) -> list[dict[str, str]]:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        log_blob(
            LOGGER,
            "llm.messages",
            messages,
            provider=self.provider_name,
            model=self.model,
        )
        return messages


class ChainedLLMProvider:
    def __init__(self, providers: list[DeepSeekProvider]) -> None:
        self.providers = providers
        log_event(
            LOGGER,
            "llm.chain.init",
            providers=[
                {"provider": provider.provider_name, "model": provider.model}
                for provider in providers
            ],
        )

    def answer(self, question: str, context: list[dict[str, Any]]) -> str:
        return self._call("answer", question, context)

    def complete_text(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
    ) -> str:
        return self._call("complete_text", system_prompt, user_prompt, max_tokens)

    def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
        schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self._call(
            "complete_json", system_prompt, user_prompt, max_tokens, schema=schema
        )

    def _call(self, method_name: str, *args: Any, **kwargs: Any) -> Any:
        log_event(
            LOGGER,
            "llm.chain.call.start",
            method_name=method_name,
            provider_count=len(self.providers),
        )
        errors: list[LLMProviderError] = []
        for provider in self.providers:
            log_event(
                LOGGER,
                "llm.chain.provider_attempt.start",
                method_name=method_name,
                provider=provider.provider_name,
                model=provider.model,
            )
            try:
                result = getattr(provider, method_name)(*args, **kwargs)
                clear_last_llm_error()
                log_blob(
                    LOGGER,
                    "llm.chain.provider_attempt.success",
                    result,
                    method_name=method_name,
                    provider=provider.provider_name,
                    model=provider.model,
                )
                return result
            except LLMProviderError as exc:
                errors.append(exc)
                record_last_llm_error(provider.provider_name, provider.model, exc)
                log_event(
                    LOGGER,
                    "llm.chain.provider_attempt.provider_error",
                    level=logging.ERROR,
                    method_name=method_name,
                    provider=provider.provider_name,
                    model=provider.model,
                    public_message=exc.public_message,
                    diagnostics=exc.diagnostics,
                    status_code=exc.status_code,
                    retryable=exc.retryable,
                )
                if not exc.retryable:
                    continue
            except Exception as exc:
                wrapped = LLMProviderError(
                    str(exc) or "LLM provider failed.",
                    diagnostics=truncate_diagnostic(repr(exc)),
                    retryable=True,
                )
                errors.append(wrapped)
                record_last_llm_error(provider.provider_name, provider.model, wrapped)
                log_event(
                    LOGGER,
                    "llm.chain.provider_attempt.unexpected_error",
                    level=logging.ERROR,
                    method_name=method_name,
                    provider=provider.provider_name,
                    model=provider.model,
                    error_type=type(exc).__name__,
                    error=str(exc),
                )
        if errors:
            last = errors[-1]
            log_event(
                LOGGER,
                "llm.chain.call.failed",
                level=logging.ERROR,
                method_name=method_name,
                error_count=len(errors),
                public_message=last.public_message,
                status_code=last.status_code,
                retryable=last.retryable,
            )
            raise LLMProviderError(
                last.public_message,
                diagnostics="\n".join(
                    error.diagnostics for error in errors if error.diagnostics
                ),
                status_code=last.status_code,
                retryable=last.retryable,
            )
        raise LLMConfigurationError(
            "DEEPSEEK_API_KEY is required for generated answers and analysis."
        )


def parse_json_object(content: str) -> dict[str, Any]:
    log_blob(LOGGER, "llm.parse_json_object.start", content)
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start < 0 or end <= start:
            raise RuntimeError("LLM response did not contain valid JSON.")
        try:
            payload = json.loads(content[start : end + 1])
        except json.JSONDecodeError as exc:
            raise RuntimeError("LLM response did not contain valid JSON.") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("LLM JSON response must be an object.")
    log_blob(LOGGER, "llm.parse_json_object.finish", payload)
    return payload


def extract_completion_text(payload: dict[str, Any]) -> str:
    log_blob(LOGGER, "llm.extract_completion_text.start", payload)
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMProviderError(
            "LLM response did not contain generated text. Try again.",
            diagnostics=truncate_diagnostic(json.dumps(payload, ensure_ascii=True)),
            retryable=True,
        ) from exc
    text = normalise_model_text(str(content))
    if not text:
        raise LLMProviderError(
            "LLM response was empty. Try again.",
            diagnostics=truncate_diagnostic(json.dumps(payload, ensure_ascii=True)),
            retryable=True,
        )
    log_blob(LOGGER, "llm.extract_completion_text.finish", text)
    return text


def get_llm_provider() -> LLMProvider:
    log_event(LOGGER, "llm.get_provider.start")
    provider_configs = [
        ProviderConfig(
            name=item["name"],
            api_key=str(item["api_key"]),
            base_url=str(item["base_url"]),
            model=str(item["model"]),
        )
        for item in Settings.llm_provider_chain()
        if item.get("api_key")
    ]
    log_event(
        LOGGER,
        "llm.get_provider.configs",
        providers=[
            {
                "provider": config.name,
                "base_url": config.base_url,
                "model": config.model,
                "api_key_configured": bool(config.api_key),
            }
            for config in provider_configs
        ],
    )
    if not provider_configs:
        raise LLMConfigurationError(
            "DEEPSEEK_API_KEY is required for generated answers and analysis."
        )
    provider = ChainedLLMProvider(
        [DeepSeekProvider(config) for config in provider_configs]
    )
    log_event(LOGGER, "llm.get_provider.finish", provider_count=len(provider_configs))
    return provider


def llm_health_snapshot() -> dict[str, Any]:
    log_event(LOGGER, "llm.health_snapshot.start")
    configured = Settings.llm_provider_chain()
    active = configured[0] if configured else None
    result = {
        "live_only": Settings.live_only_mode(),
        "provider_status": "configured" if configured else "unconfigured",
        "active_provider": active["name"] if active else "unconfigured",
        "active_model": active["model"] if active else "",
        "provider_chain": [
            {"provider": item["name"], "model": item["model"]} for item in configured
        ],
        "json_schema_enabled": Settings.llm_json_schema_enabled(),
        "last_error": LAST_LLM_ERROR,
    }
    log_blob(LOGGER, "llm.health_snapshot.finish", result)
    return result


def record_last_llm_error(
    provider_name: str,
    model: str,
    exc: LLMProviderError,
) -> None:
    global LAST_LLM_ERROR
    LAST_LLM_ERROR = {
        "provider": provider_name,
        "model": model,
        "message": exc.public_message,
        "retryable": exc.retryable,
        "status_code": exc.status_code,
        "diagnostics": truncate_diagnostic(exc.diagnostics),
        "at": datetime.now(timezone.utc).isoformat(),
    }
    log_blob(LOGGER, "llm.last_error.record", LAST_LLM_ERROR)


def clear_last_llm_error() -> None:
    global LAST_LLM_ERROR
    LAST_LLM_ERROR = None
    log_event(LOGGER, "llm.last_error.clear")


def normalise_model_text(value: str) -> str:
    result = unicodedata.normalize("NFKC", value).translate(TEXT_TRANSLATION).strip()
    log_blob(
        LOGGER,
        "llm.normalise_model_text",
        {"source": value, "result": result},
    )
    return result


def public_llm_error_message(exc: Exception) -> str:
    if isinstance(exc, LLMProviderError):
        result = exc.public_message
    else:
        result = (
            str(exc) or "LLM request failed. Check the backend console for diagnostics."
        )
    log_event(
        LOGGER,
        "llm.public_error_message",
        error_type=type(exc).__name__,
        error=str(exc),
        result=result,
    )
    return result


def public_message_for_status(status_code: int, retryable: bool) -> str:
    if status_code == 400:
        return "LLM request was rejected by the provider. Check model, prompt size, and response format."
    if status_code in {401, 403}:
        return (
            "DeepSeek API key was rejected. Check the configured key and model access."
        )
    if status_code == 402:
        return "DeepSeek account has insufficient balance."
    if status_code == 404:
        return "LLM model or endpoint was not found. Check the configured provider URL and model name."
    if status_code == 429:
        return "LLM provider rate limit reached after retries. Try again shortly."
    if retryable:
        return (
            "LLM provider is temporarily unavailable after retries. Try again shortly."
        )
    return f"LLM request failed with HTTP {status_code}. Check the backend console for diagnostics."


def retry_delay(
    attempt: int,
    response: httpx.Response | None = None,
    response_text: str = "",
) -> float:
    retry_after = retry_after_seconds(response, response_text)
    if retry_after is None:
        retry_after = Settings.llm_retry_base_seconds() * (2 ** (attempt - 1))
    delay = min(retry_after, Settings.llm_retry_max_seconds())
    jitter = random.uniform(0, min(0.25, delay * 0.1))
    return max(0.0, delay + jitter)


def retry_after_seconds(
    response: httpx.Response | None,
    response_text: str,
) -> float | None:
    if response is not None:
        header = response.headers.get("retry-after")
        if header:
            try:
                return max(0.0, float(header))
            except ValueError:
                try:
                    retry_at = parsedate_to_datetime(header)
                    if retry_at.tzinfo is None:
                        retry_at = retry_at.replace(tzinfo=timezone.utc)
                    return max(
                        0.0, (retry_at - datetime.now(timezone.utc)).total_seconds()
                    )
                except (TypeError, ValueError):
                    pass
    match = RETRY_AFTER_PATTERN.search(response_text)
    if match:
        try:
            return max(0.0, float(match.group(1)))
        except ValueError:
            return None
    return None


def safe_response_headers(response: httpx.Response) -> dict[str, str]:
    hidden = {"authorization", "proxy-authorization", "set-cookie", "cookie"}
    return {
        key: value
        for key, value in response.headers.items()
        if key.lower() not in hidden
    }


def request_diagnostics(
    *,
    provider: str,
    model: str,
    url: str,
    attempt: int,
    max_attempts: int,
    max_tokens: int | None,
    response_format: dict[str, Any] | None,
    elapsed_seconds: float,
    status_code: int | None = None,
    response_headers: dict[str, str] | None = None,
    response_body: str = "",
    error_type: str = "",
    error_detail: str = "",
) -> str:
    diagnostic = {
        "provider": provider,
        "model": model,
        "url": url,
        "attempt": attempt,
        "max_attempts": max_attempts,
        "max_tokens": max_tokens,
        "response_format": response_format,
        "elapsed_seconds": round(elapsed_seconds, 3),
        "status_code": status_code,
        "response_headers": response_headers or {},
        "response_body": truncate_diagnostic(response_body),
        "error_type": error_type,
        "error_detail": truncate_diagnostic(error_detail),
    }
    log_blob(LOGGER, "llm.request_diagnostics", diagnostic)
    return json.dumps(diagnostic, ensure_ascii=True, sort_keys=True)


def truncate_diagnostic(value: str) -> str:
    return value
