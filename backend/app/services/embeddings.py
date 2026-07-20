from __future__ import annotations

from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Any, Protocol

from fastembed import TextEmbedding

from app.services.terminal_logging import log_blob, log_event
from app.settings import Settings

LOGGER = logging.getLogger(__name__)


class EmbeddingProvider(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class EmbeddingProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class LocalEmbeddingConfig:
    model_name: str
    dimensions: int
    batch_size: int
    cache_dir: Path
    local_files_only: bool


class LocalFastEmbedProvider:
    def __init__(self, config: LocalEmbeddingConfig, model: Any | None = None) -> None:
        self.model_name = config.model_name
        self.dimensions = config.dimensions
        self.batch_size = config.batch_size
        self.cache_dir = config.cache_dir
        self.local_files_only = config.local_files_only
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.model = model or TextEmbedding(
            model_name=self.model_name,
            cache_dir=str(self.cache_dir),
            local_files_only=self.local_files_only,
        )
        log_event(
            LOGGER,
            "embeddings.provider.init",
            provider=self.__class__.__name__,
            model=self.model_name,
            dimensions=self.dimensions,
            batch_size=self.batch_size,
            cache_dir=str(self.cache_dir),
            local_files_only=self.local_files_only,
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        cleaned = [str(text) for text in texts]
        log_event(
            LOGGER,
            "embeddings.embed.start",
            text_count=len(cleaned),
            model=self.model_name,
            dimensions=self.dimensions,
        )
        if not cleaned:
            return []
        try:
            raw_vectors = list(self.model.embed(cleaned, batch_size=self.batch_size))
        except Exception as exc:
            raise EmbeddingProviderError(
                f"Local embedding generation failed: {type(exc).__name__}."
            ) from exc
        vectors = [normalise_vector(vector, self.dimensions) for vector in raw_vectors]
        if len(vectors) != len(cleaned):
            raise EmbeddingProviderError("Embedding provider returned the wrong count.")
        log_blob(
            LOGGER,
            "embeddings.embed.finish",
            vectors,
            text_count=len(cleaned),
            model=self.model_name,
        )
        return vectors


def normalise_vector(vector: Any, dimensions: int) -> list[float]:
    if hasattr(vector, "tolist"):
        values = vector.tolist()
    else:
        values = vector
    if not isinstance(values, list):
        raise EmbeddingProviderError("Embedding vector is invalid.")
    result = [float(value) for value in values]
    if len(result) != dimensions:
        raise EmbeddingProviderError(
            f"Embedding dimensions mismatch. Expected {dimensions}, got {len(result)}."
        )
    return result


_PROVIDER: EmbeddingProvider | None = None


def get_embedding_provider() -> EmbeddingProvider:
    global _PROVIDER
    if _PROVIDER is None:
        _PROVIDER = LocalFastEmbedProvider(
            LocalEmbeddingConfig(
                model_name=Settings.embedding_model(),
                dimensions=Settings.embedding_dimensions(),
                batch_size=Settings.embedding_batch_size(),
                cache_dir=Settings.embedding_cache_dir(),
                local_files_only=Settings.embedding_local_files_only(),
            )
        )
    return _PROVIDER


def reset_embedding_provider() -> None:
    global _PROVIDER
    _PROVIDER = None
