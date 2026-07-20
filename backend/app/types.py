from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=800)
    filters: dict[str, Any] = Field(default_factory=dict)


class RCARequest(BaseModel):
    asset: str = Field(min_length=1, max_length=80)
    symptom: str = Field(min_length=1, max_length=400)


class ComplianceRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
