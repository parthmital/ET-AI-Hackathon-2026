from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.terminal_logging import (
    TRACE_LEVEL,
    configure_terminal_logging,
    log_event,
    reset_log_context,
    set_log_context,
)

configure_terminal_logging()

from app.api.router import api_router
from app.services.database import Database
from app.settings import Settings

LOGGER = logging.getLogger(__name__)


@asynccontextmanager
async def backend_lifespan(_: FastAPI) -> Any:
    log_event(LOGGER, "backend.lifespan.startup.begin")
    Settings.ensure_directories()
    Database.initialise()
    log_event(LOGGER, "backend.lifespan.startup.complete")
    try:
        yield
    finally:
        log_event(LOGGER, "backend.lifespan.shutdown")
        Database.dispose()


def create_app() -> FastAPI:
    app_instance = FastAPI(
        title="Industrial Ops Brain API",
        description="AI powered Industrial Knowledge Intelligence prototype for ET AI Hackathon 2026.",
        version="1.0.0",
        lifespan=backend_lifespan,
    )
    app_instance.add_middleware(
        CORSMiddleware,
        allow_origins=Settings.cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app_instance.middleware("http")(log_http_request)
    app_instance.include_router(api_router)
    app_instance.add_exception_handler(Exception, unhandled_exception)
    return app_instance


async def log_http_request(request: Request, call_next: Any) -> Any:
    started_at = time.perf_counter()
    client = request.client.host if request.client else ""
    request_id = (
        request.headers.get("x-request-id")
        or request.headers.get("x-amzn-trace-id")
        or uuid4().hex
    )
    correlation_id = request.headers.get("x-correlation-id") or request_id
    context_tokens = set_log_context(request_id, correlation_id)
    log_event(
        LOGGER,
        "http.request.start",
        level=TRACE_LEVEL,
        request_id=request_id,
        correlation_id=correlation_id,
        method=request.method,
        url=str(request.url),
        path=request.url.path,
        query=request.url.query,
        client=client,
        headers=dict(request.headers),
        content_length=request.headers.get("content-length"),
        content_type=request.headers.get("content-type"),
    )
    try:
        response = await call_next(request)
    except Exception as exc:
        LOGGER.exception(
            "HTTP request raised an exception. method=%s path=%s request_id=%s correlation_id=%s",
            request.method,
            request.url.path,
            request_id,
            correlation_id,
        )
        log_event(
            LOGGER,
            "http.request.exception",
            level=logging.ERROR,
            request_id=request_id,
            correlation_id=correlation_id,
            method=request.method,
            path=request.url.path,
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
            error_type=type(exc).__name__,
            error=str(exc),
        )
        reset_log_context(context_tokens)
        raise
    try:
        if "x-request-id" not in response.headers:
            response.headers["x-request-id"] = request_id
        if "x-correlation-id" not in response.headers:
            response.headers["x-correlation-id"] = correlation_id
        log_event(
            LOGGER,
            "http.request.finish",
            request_id=request_id,
            correlation_id=correlation_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            content_length=response.headers.get("content-length"),
            content_type=response.headers.get("content-type"),
            elapsed_seconds=round(time.perf_counter() - started_at, 3),
        )
        log_event(
            LOGGER,
            "http.request.finish.detail",
            level=TRACE_LEVEL,
            request_id=request_id,
            correlation_id=correlation_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            response_headers=dict(response.headers),
        )
        return response
    finally:
        reset_log_context(context_tokens)


async def unhandled_exception(_: Any, exc: Exception) -> JSONResponse:
    LOGGER.exception("Unhandled backend error.")
    detail = (
        f"Unexpected error: {exc}"
        if Settings.debug_errors_enabled()
        else "Unexpected server error."
    )
    return JSONResponse(status_code=500, content={"detail": detail})


app = create_app()
