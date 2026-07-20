from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.terminal_logging import log_event

LOGGER = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash"
DEFAULT_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
DEFAULT_EMBEDDING_DIMENSIONS = 384


class RuntimeSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str | None = None
    test_database_url: str | None = None
    database_schema: str | None = None
    sqlalchemy_echo: str = "false"
    sqlalchemy_echo_pool: str = "false"
    cors_origins: str | None = None
    max_upload_mb: str = "25"
    debug_errors: str | None = None
    analysis_batch_characters: str | None = None
    embedding_model: str = DEFAULT_EMBEDDING_MODEL
    embedding_dimensions: str | None = None
    embedding_batch_size: str | None = None
    embedding_cache_dir: str | None = None
    embedding_local_files_only: str | None = None
    deepseek_api_key: str | None = None
    deepseek_base_url: str = DEFAULT_DEEPSEEK_BASE_URL
    deepseek_model: str = DEFAULT_DEEPSEEK_MODEL
    llm_json_schema: str | None = None
    enable_ocr: str | None = None
    ocr_engine: str = "rapidocr"
    ocr_min_text_characters: str | None = None
    llm_max_attempts: str | None = None
    llm_json_attempts: str | None = None
    llm_output_attempts: str | None = None
    llm_retry_base_seconds: str | None = None
    llm_retry_max_seconds: str | None = None
    llm_timeout_seconds: str | None = None


def runtime_settings() -> RuntimeSettings:
    return RuntimeSettings()


def _env(name: str, default: str | None = None) -> str | None:
    value = getattr(runtime_settings(), name.lower(), None)
    return default if value is None else str(value)


def _truthy(value: str | None, default: bool = False) -> bool:
    if value is None:
        log_event(
            LOGGER, "settings.truthy", value=value, default=default, result=default
        )
        return default
    result = value.strip().lower() in {"1", "true", "yes", "on"}
    log_event(LOGGER, "settings.truthy", value=value, default=default, result=result)
    return result


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = _env(name)
    try:
        value = int(raw) if raw is not None else default
    except ValueError:
        value = default
    result = min(max(value, minimum), maximum)
    log_event(
        LOGGER,
        "settings.int_env",
        name=name,
        raw=raw,
        default=default,
        minimum=minimum,
        maximum=maximum,
        result=result,
    )
    return result


def _float_env(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = _env(name)
    try:
        value = float(raw) if raw is not None else default
    except ValueError:
        value = default
    result = min(max(value, minimum), maximum)
    log_event(
        LOGGER,
        "settings.float_env",
        name=name,
        raw=raw,
        default=default,
        minimum=minimum,
        maximum=maximum,
        result=result,
    )
    return result


def _postgres_url(raw: str, name: str) -> str:
    value = raw.strip()
    if value.startswith("postgresql+psycopg://"):
        log_event(
            LOGGER, "settings.postgres_url", name=name, scheme="postgresql+psycopg"
        )
        return value
    if value.startswith("postgresql://"):
        log_event(LOGGER, "settings.postgres_url", name=name, scheme="postgresql")
        return "postgresql+psycopg://" + value.removeprefix("postgresql://")
    if value.startswith("postgres://"):
        log_event(LOGGER, "settings.postgres_url", name=name, scheme="postgres")
        return "postgresql+psycopg://" + value.removeprefix("postgres://")
    raise RuntimeError(
        f"{name} must be a Postgres URL starting with postgresql:// or postgres://."
    )


def _is_local_http_url(raw: str) -> bool:
    try:
        parsed = urlparse(raw)
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and parsed.hostname in {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
    }


def _deepseek_url(raw: str) -> str:
    value = raw.strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.hostname != "api.deepseek.com":
        raise RuntimeError(
            "DEEPSEEK_BASE_URL must use https://api.deepseek.com. No other external LLM endpoint is supported."
        )
    return value


class Settings:
    backend_dir = BACKEND_DIR
    project_dir = PROJECT_DIR
    data_dir = backend_dir / "data"
    upload_dir = data_dir / "uploads"

    @staticmethod
    def ensure_directories() -> None:
        for path in (
            Settings.data_dir,
            Settings.upload_dir,
        ):
            path.mkdir(parents=True, exist_ok=True)
            log_event(LOGGER, "settings.ensure_directory", path=str(path))

    @staticmethod
    def database_url() -> str:
        raw = _env("DATABASE_URL")
        if not raw or not raw.strip():
            raise RuntimeError(
                "DATABASE_URL is required. Set it to a local Postgres connection URL in the root .env file."
            )
        return _postgres_url(raw, "DATABASE_URL")

    @staticmethod
    def test_database_url() -> str | None:
        raw = _env("TEST_DATABASE_URL")
        if not raw or not raw.strip():
            log_event(LOGGER, "settings.test_database_url", configured=False)
            return None
        log_event(LOGGER, "settings.test_database_url", configured=True)
        return _postgres_url(raw, "TEST_DATABASE_URL")

    @staticmethod
    def database_schema() -> str | None:
        raw = _env("DATABASE_SCHEMA")
        if not raw or not raw.strip():
            log_event(LOGGER, "settings.database_schema", schema=None)
            return None
        value = raw.strip()
        if not value.replace("_", "").isalnum() or value[0].isdigit():
            raise RuntimeError(
                "DATABASE_SCHEMA must contain only letters, numbers, and underscores, and must not start with a number."
            )
        log_event(LOGGER, "settings.database_schema", schema=value)
        return value

    @staticmethod
    def sqlalchemy_echo() -> bool | str:
        raw = _env("SQLALCHEMY_ECHO", "false") or "false"
        normalised = raw.strip().lower()
        if normalised in {"debug", "trace", "verbose", "silly"}:
            result: bool | str = "debug"
        else:
            result = _truthy(raw, default=False)
        log_event(LOGGER, "settings.sqlalchemy_echo", raw=raw, result=result)
        return result

    @staticmethod
    def sqlalchemy_echo_pool() -> bool | str:
        raw = _env("SQLALCHEMY_ECHO_POOL", "false") or "false"
        normalised = raw.strip().lower()
        if normalised in {"debug", "trace", "verbose", "silly"}:
            result: bool | str = "debug"
        else:
            result = _truthy(raw, default=False)
        log_event(LOGGER, "settings.sqlalchemy_echo_pool", raw=raw, result=result)
        return result

    @staticmethod
    def cors_origins() -> list[str]:
        default_origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            "http://localhost:3002",
            "http://127.0.0.1:3002",
        ]
        raw = _env("CORS_ORIGINS") or ",".join(default_origins)
        result = [
            origin.strip()
            for origin in raw.split(",")
            if origin.strip() and _is_local_http_url(origin.strip())
        ]
        if not result:
            result = default_origins
        log_event(LOGGER, "settings.cors_origins", origins=result)
        return result

    @staticmethod
    def max_upload_size_bytes() -> int:
        raw = _env("MAX_UPLOAD_MB", "25") or "25"
        try:
            megabytes = max(1, int(raw))
        except ValueError:
            megabytes = 25
        result = megabytes * 1024 * 1024
        log_event(
            LOGGER, "settings.max_upload_size_bytes", megabytes=megabytes, result=result
        )
        return result

    @staticmethod
    def debug_errors_enabled() -> bool:
        result = _truthy(_env("DEBUG_ERRORS"), default=False)
        log_event(LOGGER, "settings.debug_errors_enabled", result=result)
        return result

    @staticmethod
    def analysis_batch_characters() -> int:
        result = _int_env("ANALYSIS_BATCH_CHARACTERS", 12000, 2000, 50000)
        log_event(LOGGER, "settings.analysis_batch_characters", result=result)
        return result

    @staticmethod
    def embedding_model() -> str:
        result = (
            _env("EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL) or DEFAULT_EMBEDDING_MODEL
        )
        log_event(LOGGER, "settings.embedding_model", result=result)
        return result

    @staticmethod
    def embedding_dimensions() -> int:
        result = _int_env(
            "EMBEDDING_DIMENSIONS",
            DEFAULT_EMBEDDING_DIMENSIONS,
            DEFAULT_EMBEDDING_DIMENSIONS,
            DEFAULT_EMBEDDING_DIMENSIONS,
        )
        log_event(LOGGER, "settings.embedding_dimensions", result=result)
        return result

    @staticmethod
    def embedding_batch_size() -> int:
        result = _int_env("EMBEDDING_BATCH_SIZE", 64, 1, 256)
        log_event(LOGGER, "settings.embedding_batch_size", result=result)
        return result

    @staticmethod
    def embedding_cache_dir() -> Path:
        raw = _env("EMBEDDING_CACHE_DIR")
        result = (
            Path(raw).expanduser()
            if raw and raw.strip()
            else Settings.data_dir / "fastembed"
        )
        if not result.is_absolute():
            result = Settings.project_dir / result
        log_event(LOGGER, "settings.embedding_cache_dir", result=str(result))
        return result

    @staticmethod
    def embedding_local_files_only() -> bool:
        result = _truthy(_env("EMBEDDING_LOCAL_FILES_ONLY"), default=True)
        log_event(LOGGER, "settings.embedding_local_files_only", result=result)
        return result

    @staticmethod
    def deepseek_api_key() -> str | None:
        result = _env("DEEPSEEK_API_KEY")
        log_event(LOGGER, "settings.deepseek_api_key", configured=bool(result))
        return result

    @staticmethod
    def deepseek_base_url() -> str:
        raw = _env("DEEPSEEK_BASE_URL", DEFAULT_DEEPSEEK_BASE_URL)
        result = _deepseek_url(raw or DEFAULT_DEEPSEEK_BASE_URL)
        log_event(LOGGER, "settings.deepseek_base_url", result=result)
        return result

    @staticmethod
    def deepseek_model() -> str:
        result = (
            _env("DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL) or DEFAULT_DEEPSEEK_MODEL
        )
        log_event(LOGGER, "settings.deepseek_model", result=result)
        return result

    @staticmethod
    def deepseek_thinking_type() -> str:
        return "disabled"

    @staticmethod
    def llm_provider_name() -> str:
        active = Settings.active_llm_provider_config()
        return str(active["name"]) if active else "unconfigured"

    @staticmethod
    def active_llm_provider_config() -> dict[str, Any] | None:
        providers = Settings.llm_provider_chain()
        return providers[0] if providers else None

    @staticmethod
    def llm_provider_chain() -> list[dict[str, Any]]:
        providers: list[dict[str, Any]] = []
        if Settings.deepseek_api_key():
            providers.append(
                {
                    "name": "deepseek",
                    "api_key": Settings.deepseek_api_key(),
                    "base_url": Settings.deepseek_base_url(),
                    "model": Settings.deepseek_model(),
                    "thinking_type": Settings.deepseek_thinking_type(),
                }
            )
        log_event(
            LOGGER,
            "settings.llm_provider_chain",
            providers=[
                {
                    "name": provider["name"],
                    "base_url": provider["base_url"],
                    "model": provider["model"],
                    "api_key_configured": bool(provider.get("api_key")),
                }
                for provider in providers
            ],
        )
        return providers

    @staticmethod
    def live_only_mode() -> bool:
        log_event(LOGGER, "settings.live_only_mode", result=True)
        return True

    @staticmethod
    def llm_json_schema_enabled() -> bool:
        result = _truthy(_env("LLM_JSON_SCHEMA"), default=True)
        log_event(LOGGER, "settings.llm_json_schema_enabled", result=result)
        return result

    @staticmethod
    def ocr_enabled() -> bool:
        result = _truthy(_env("ENABLE_OCR"), default=True)
        log_event(LOGGER, "settings.ocr_enabled", result=result)
        return result

    @staticmethod
    def ocr_engine() -> str:
        result = _env("OCR_ENGINE", "rapidocr") or "rapidocr"
        log_event(LOGGER, "settings.ocr_engine", result=result)
        return result

    @staticmethod
    def ocr_min_text_characters() -> int:
        result = _int_env("OCR_MIN_TEXT_CHARACTERS", 80, 0, 2000)
        log_event(LOGGER, "settings.ocr_min_text_characters", result=result)
        return result

    @staticmethod
    def llm_max_attempts() -> int:
        result = _int_env("LLM_MAX_ATTEMPTS", 5, 1, 10)
        log_event(LOGGER, "settings.llm_max_attempts", result=result)
        return result

    @staticmethod
    def llm_json_attempts() -> int:
        result = _int_env("LLM_JSON_ATTEMPTS", 2, 1, 4)
        log_event(LOGGER, "settings.llm_json_attempts", result=result)
        return result

    @staticmethod
    def llm_output_attempts() -> int:
        result = _int_env("LLM_OUTPUT_ATTEMPTS", 2, 1, 4)
        log_event(LOGGER, "settings.llm_output_attempts", result=result)
        return result

    @staticmethod
    def llm_retry_base_seconds() -> float:
        result = _float_env("LLM_RETRY_BASE_SECONDS", 1.0, 0.1, 10.0)
        log_event(LOGGER, "settings.llm_retry_base_seconds", result=result)
        return result

    @staticmethod
    def llm_retry_max_seconds() -> float:
        result = _float_env("LLM_RETRY_MAX_SECONDS", 20.0, 1.0, 120.0)
        log_event(LOGGER, "settings.llm_retry_max_seconds", result=result)
        return result

    @staticmethod
    def llm_timeout_seconds() -> float:
        result = _float_env("LLM_TIMEOUT_SECONDS", 45.0, 5.0, 180.0)
        log_event(LOGGER, "settings.llm_timeout_seconds", result=result)
        return result

    @staticmethod
    def default_workspace_id() -> str:
        return "local-workspace"

    @staticmethod
    def default_workspace_name() -> str:
        return "Local Workspace"
