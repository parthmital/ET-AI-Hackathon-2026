from __future__ import annotations

from collections.abc import Mapping, Sequence
from contextvars import ContextVar, Token
import json
import logging
import os
import sys
from typing import Any

TRACE_LEVEL = 5
DEFAULT_LOG_LEVEL = logging.INFO
DEFAULT_SQLALCHEMY_LOG_LEVEL = logging.WARNING
REQUEST_ID: ContextVar[str] = ContextVar("request_id", default="")
CORRELATION_ID: ContextVar[str] = ContextVar("correlation_id", default="")

REDACTED = "[redacted]"
SENSITIVE_KEYS = {
    "api-key",
    "api_key",
    "authorization",
    "cookie",
    "password",
    "proxy-authorization",
    "secret",
    "set-cookie",
    "token",
}
SUMMARY_IDENTIFIER_KEYS = {
    "active_model",
    "active_provider",
    "analysis_source",
    "analysis_status",
    "asset_id",
    "base_url",
    "chunk_id",
    "content_hash",
    "correlation_id",
    "document_id",
    "document_type",
    "elapsed_milliseconds",
    "elapsed_seconds",
    "error_type",
    "event",
    "filename",
    "id",
    "method",
    "model",
    "name",
    "operation",
    "page",
    "path",
    "provider",
    "provider_name",
    "request_id",
    "result",
    "run_id",
    "schema",
    "service",
    "source",
    "status",
    "status_code",
    "status_text",
    "type",
}
SUMMARY_COUNT_KEYS = {
    "assets",
    "chunks",
    "citations",
    "compliance_gaps",
    "documents",
    "edges",
    "entities",
    "files",
    "gaps",
    "items",
    "matches",
    "nodes",
    "open_compliance_gaps",
    "paths",
    "provider_chain",
    "related_documents",
    "related_entities",
    "rows",
    "timeline_events",
}
SUMMARY_METRIC_SUFFIXES = (
    "_count",
    "_id",
    "_ids",
    "_size",
    "_seconds",
    "_milliseconds",
)
SUMMARY_TEXT_KEYS = {
    "body",
    "completion",
    "content",
    "context",
    "context_text",
    "diagnostic",
    "error",
    "headers",
    "html",
    "message",
    "payload",
    "prompt",
    "query",
    "raw",
    "reason",
    "response",
    "response_headers",
    "stack",
    "system_prompt",
    "text",
    "url",
    "user_agent",
    "user_prompt",
    "value",
    "values",
}
TRACE_BY_DEFAULT_PREFIXES = (
    "analysis.clean_",
    "analysis.evidence_batches.",
    "analysis.evidence_supported",
    "analysis.generate.batch.",
    "analysis.generate.evidence_batches",
    "analysis.generate.source_pages",
    "analysis.generate.system_prompt",
    "analysis.merge.",
    "analysis.normalise_",
    "analysis.source_",
    "analysis.unique_",
    "analysis.validate_",
    "database.connection.",
    "database.execute.",
    "database.row.",
    "database.rows.",
    "database.session.",
    "database.statement",
    "graph.edge.",
    "graph.node.",
    "graph.paths.asset_paths",
    "graph.path_for_asset.related_data",
    "intelligence.citations.",
    "intelligence.chat.citations",
    "intelligence.chat.matches",
    "intelligence.chat.related_entities",
    "intelligence.rca.citations",
    "intelligence.rca.context_text",
    "intelligence.rca.llm_payload",
    "intelligence.rca.matches",
    "intelligence.related_entities.",
    "llm.answer.start",
    "llm.complete_json.start",
    "llm.complete_json.parsed",
    "llm.complete_json.raw_content",
    "llm.complete_json.repaired_parsed",
    "llm.complete_json.repaired_raw_content",
    "llm.complete_json_text.response_format_attempt",
    "llm.completion_text.extracted_text",
    "llm.completion_text.provider_payload",
    "llm.extract_completion_text",
    "llm.http.request.",
    "llm.http.response.",
    "llm.messages",
    "llm.normalise_model_text",
    "llm.parse_json_object",
    "llm.public_error_message",
    "llm.request_diagnostics",
    "parser.pdf.page_text",
    "parser.xlsx.sheet",
    "settings.",
    "vector_store.",
)
SUMMARY_PREVIEW_LENGTH = 96
SUMMARY_SAMPLE_SIZE = 3


class TerminalContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = REQUEST_ID.get()
        record.correlation_id = CORRELATION_ID.get()
        return True


class ColourFormatter(logging.Formatter):
    COLOURS = {
        TRACE_LEVEL: "\x1b[90m",
        logging.DEBUG: "\x1b[36m",
        logging.INFO: "\x1b[32m",
        logging.WARNING: "\x1b[33m",
        logging.ERROR: "\x1b[31m",
        logging.CRITICAL: "\x1b[41m",
    }
    RESET = "\x1b[0m"

    def __init__(self, *args: Any, use_colour: bool = True, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.use_colour = use_colour

    def format(self, record: logging.LogRecord) -> str:
        rendered = super().format(record)
        if not self.use_colour:
            return rendered
        colour = self.COLOURS.get(record.levelno)
        if not colour:
            return rendered
        return f"{colour}{rendered}{self.RESET}"


def _install_trace_level() -> None:
    logging.addLevelName(TRACE_LEVEL, "TRACE")

    if hasattr(logging.Logger, "trace"):
        return

    def trace(self: logging.Logger, message: str, *args: Any, **kwargs: Any) -> None:
        if self.isEnabledFor(TRACE_LEVEL):
            self._log(TRACE_LEVEL, message, args, **kwargs)

    logging.Logger.trace = trace  # type: ignore[attr-defined]


def _log_level(name: str | None, default: int = DEFAULT_LOG_LEVEL) -> int:
    if name is None:
        return default
    normalised = name.strip().upper()
    if normalised in {"ALL", "SILLY", "TRACE", "VERBOSE"}:
        return TRACE_LEVEL
    if normalised == "NOTSET":
        return logging.NOTSET
    return int(getattr(logging, normalised, default))


def _colour_enabled() -> bool:
    if os.getenv("NO_COLOR"):
        return False
    return os.getenv("LOG_COLOR", os.getenv("FORCE_COLOR", "1")).lower() not in {
        "0",
        "false",
        "no",
        "off",
    }


def configure_terminal_logging() -> None:
    _install_trace_level()
    level = _log_level(os.getenv("TERMINAL_LOG_LEVEL") or os.getenv("LOG_LEVEL"))
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.NOTSET)
    handler.addFilter(TerminalContextFilter())
    handler.setFormatter(
        ColourFormatter(
            "%(asctime)s | %(levelname)-8s | %(process)d | %(name)s | request_id=%(request_id)s | correlation_id=%(correlation_id)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            use_colour=_colour_enabled(),
        )
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
    logging.captureWarnings(True)

    app_logger_names = ("app",)
    for logger_name in app_logger_names:
        logger = logging.getLogger(logger_name)
        logger.disabled = False
        logger.setLevel(level)

    third_party_level = level if level <= logging.DEBUG else logging.WARNING
    noisy_logger_names = (
        "alembic",
        "asyncio",
        "docling",
        "fitz",
        "httpcore",
        "httpcore.connection",
        "httpcore.http11",
        "httpcore.http2",
        "httpx",
        "multipart",
        "onnxruntime",
        "psycopg",
        "rapidocr",
        "sqlalchemy",
        "sqlalchemy.dialects",
        "sqlalchemy.engine",
        "sqlalchemy.orm",
        "sqlalchemy.pool",
        "uvicorn",
        "uvicorn.access",
        "uvicorn.asgi",
        "uvicorn.error",
        "watchfiles",
        "websockets",
    )
    for logger_name in noisy_logger_names:
        logger = logging.getLogger(logger_name)
        logger.disabled = False
        logger.setLevel(third_party_level)

    for logger_name, logger_item in logging.root.manager.loggerDict.items():
        if not isinstance(logger_item, logging.Logger):
            continue
        logger_item.disabled = False
        if logger_name == "app" or logger_name.startswith("app."):
            logger_item.setLevel(level)
        else:
            logger_item.setLevel(third_party_level)

    sqlalchemy_level = _log_level(
        os.getenv("SQLALCHEMY_LOG_LEVEL"), DEFAULT_SQLALCHEMY_LOG_LEVEL
    )
    for logger_name in (
        "sqlalchemy",
        "sqlalchemy.dialects",
        "sqlalchemy.engine",
        "sqlalchemy.orm",
        "sqlalchemy.pool",
    ):
        logging.getLogger(logger_name).setLevel(sqlalchemy_level)

    logging.getLogger(__name__).log(
        TRACE_LEVEL,
        "terminal_logging.configure %s",
        to_log_json(
            {
                "log_level": logging.getLevelName(level),
                "sqlalchemy_log_level": logging.getLevelName(sqlalchemy_level),
                "colour": _colour_enabled(),
                "warnings_captured": True,
            }
        ),
    )


def set_log_context(
    request_id: str | None = None,
    correlation_id: str | None = None,
) -> tuple[Token[str], Token[str]]:
    return (
        REQUEST_ID.set(request_id or ""),
        CORRELATION_ID.set(correlation_id or ""),
    )


def reset_log_context(tokens: tuple[Token[str], Token[str]]) -> None:
    request_token, correlation_token = tokens
    REQUEST_ID.reset(request_token)
    CORRELATION_ID.reset(correlation_token)


def log_event(
    logger: logging.Logger,
    event: str,
    level: int = logging.INFO,
    **fields: Any,
) -> None:
    level = _default_level_for_event(event, level)
    if fields:
        logger.log(level, "%s %s", event, _json_for_level(logger, fields))
        return
    logger.log(level, "%s", event)


def log_blob(
    logger: logging.Logger,
    event: str,
    value: Any,
    level: int = logging.INFO,
    **fields: Any,
) -> None:
    level = _default_level_for_event(event, level)
    if is_trace_enabled(logger):
        metadata = f" {to_log_json(fields)}" if fields else ""
        rendered = render_for_log(value)
        logger.log(level, "%s.begin%s\n%s\n%s.end", event, metadata, rendered, event)
        return
    summary = summarise_for_log(value)
    if fields:
        metadata = summarise_for_log(fields)
        logger.log(
            level, "%s %s", event, to_log_json(_merge_summaries(metadata, summary))
        )
        return
    logger.log(level, "%s %s", event, to_log_json(summary))


def to_log_json(value: Any) -> str:
    return json.dumps(
        sanitise_for_log(value),
        ensure_ascii=True,
        default=str,
        sort_keys=True,
    )


def to_summary_json(value: Any) -> str:
    return json.dumps(
        summarise_for_log(value),
        ensure_ascii=True,
        default=str,
        sort_keys=True,
    )


def render_for_log(value: Any) -> str:
    if isinstance(value, str):
        return value
    return to_log_json(value)


def summarise_for_log(value: Any) -> Any:
    return _summarise(sanitise_for_log(value))


def sanitise_for_log(value: Any) -> Any:
    if isinstance(value, Mapping):
        result: dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            if is_sensitive_key(key_text):
                result[key_text] = REDACTED
            else:
                result[key_text] = sanitise_for_log(item)
        return result
    if isinstance(value, list):
        return [sanitise_for_log(item) for item in value]
    if isinstance(value, tuple):
        return [sanitise_for_log(item) for item in value]
    if isinstance(value, set):
        return sorted((sanitise_for_log(item) for item in value), key=str)
    if isinstance(value, bytes):
        return {
            "type": "bytes",
            "length": len(value),
            "hex": value.hex(),
        }
    return value


def is_sensitive_key(key: str) -> bool:
    normalised = key.strip().lower().replace("_", "-")
    if normalised in SENSITIVE_KEYS:
        return True
    return normalised.endswith("-api-key")


def is_trace_enabled(logger: logging.Logger | None = None) -> bool:
    if logger is not None and logger.isEnabledFor(TRACE_LEVEL):
        return True
    return logging.getLogger().isEnabledFor(TRACE_LEVEL)


def _default_level_for_event(event: str, level: int) -> int:
    if level != logging.INFO:
        return level
    if event.startswith(TRACE_BY_DEFAULT_PREFIXES):
        return TRACE_LEVEL
    return level


def _json_for_level(logger: logging.Logger, fields: Mapping[str, Any]) -> str:
    if is_trace_enabled(logger):
        return to_log_json(fields)
    return to_summary_json(fields)


def _merge_summaries(metadata: Any, summary: Any) -> Any:
    if isinstance(metadata, Mapping) and isinstance(summary, Mapping):
        return {**metadata, **summary}
    if isinstance(metadata, Mapping):
        return {**metadata, "value": summary}
    return {"metadata": metadata, "value": summary}


def _summarise(value: Any, depth: int = 0) -> Any:
    if isinstance(value, Mapping):
        return _summarise_mapping(value, depth)
    if isinstance(value, list):
        return _summarise_sequence(value, "list", depth)
    if isinstance(value, tuple):
        return _summarise_sequence(list(value), "tuple", depth)
    if isinstance(value, set):
        return _summarise_sequence(sorted(value, key=str), "set", depth)
    if isinstance(value, bytes):
        return {"type": "bytes", "bytes": len(value)}
    if isinstance(value, BaseException):
        return {
            "type": type(value).__name__,
            "message": _summarise_string(str(value), keep_preview=True),
        }
    if isinstance(value, str):
        return _summarise_string(
            value, keep_preview=len(value) <= SUMMARY_PREVIEW_LENGTH
        )
    return value


def _summarise_mapping(value: Mapping[str, Any], depth: int) -> dict[str, Any]:
    result: dict[str, Any] = {"type": "dict", "key_count": len(value)}
    for key, item in value.items():
        key_text = str(key)
        normalised = key_text.strip().lower()
        if is_sensitive_key(key_text):
            result[key_text] = REDACTED
            continue
        if _is_countable_key(normalised, item):
            result[f"{key_text}_count"] = len(item)  # type: ignore[arg-type]
            continue
        if _is_summary_key(normalised):
            result[key_text] = _summarise_field(key_text, item, depth)
            continue
        if isinstance(item, (int, float, bool)) or item is None:
            result[key_text] = item
            continue
    if len(result) == 2 and value:
        result["keys"] = sorted(str(key) for key in value.keys())[:8]
    return result


def _summarise_sequence(
    value: Sequence[Any], type_name: str, depth: int
) -> dict[str, Any]:
    result: dict[str, Any] = {"type": type_name, "count": len(value)}
    sample = [
        _summarise_item_identifier(item, depth + 1)
        for item in value[:SUMMARY_SAMPLE_SIZE]
    ]
    sample = [item for item in sample if item]
    if sample:
        result["sample"] = sample
    return result


def _summarise_item_identifier(value: Any, depth: int) -> Any:
    if isinstance(value, Mapping):
        result: dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            normalised = key_text.strip().lower()
            if is_sensitive_key(key_text):
                result[key_text] = REDACTED
            elif _is_summary_key(normalised):
                result[key_text] = _summarise_field(key_text, item, depth)
        return result
    if isinstance(value, str):
        return _summarise_string(
            value, keep_preview=len(value) <= SUMMARY_PREVIEW_LENGTH
        )
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return None


def _summarise_field(key: str, value: Any, depth: int) -> Any:
    normalised = key.strip().lower()
    if normalised in SUMMARY_TEXT_KEYS:
        if isinstance(value, str):
            keep_preview = normalised in {"error", "message", "reason", "status_text"}
            return _summarise_string(value, keep_preview=keep_preview)
        if isinstance(value, Mapping):
            if value.get("type") == "bytes" and "length" in value:
                return {"type": "bytes", "bytes": value["length"]}
            return {"type": "dict", "key_count": len(value)}
        if isinstance(value, Sequence) and not isinstance(
            value, (str, bytes, bytearray)
        ):
            return {"type": "list", "count": len(value)}
    if depth >= 2:
        return _summarise_scalar(value)
    return _summarise(value, depth + 1)


def _summarise_scalar(value: Any) -> Any:
    if isinstance(value, str):
        return _summarise_string(
            value, keep_preview=len(value) <= SUMMARY_PREVIEW_LENGTH
        )
    if isinstance(value, bytes):
        return {"type": "bytes", "bytes": len(value)}
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return {"type": type(value).__name__}


def _summarise_string(value: str, keep_preview: bool) -> Any:
    if keep_preview:
        return _trim_preview(value)
    return {"type": "str", "chars": len(value)}


def _trim_preview(value: str) -> str:
    compact = " ".join(value.split())
    if len(compact) <= SUMMARY_PREVIEW_LENGTH:
        return compact
    return f"{compact[:SUMMARY_PREVIEW_LENGTH]}..."


def _is_summary_key(key: str) -> bool:
    if key in SUMMARY_IDENTIFIER_KEYS or key in SUMMARY_TEXT_KEYS:
        return True
    return key.endswith(SUMMARY_METRIC_SUFFIXES)


def _is_countable_key(key: str, value: Any) -> bool:
    return (
        key in SUMMARY_COUNT_KEYS
        and isinstance(value, Sequence)
        and not isinstance(value, (str, bytes, bytearray))
    )
    "llm.complete_text.start",
