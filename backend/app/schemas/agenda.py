import json
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_serializer, field_validator

from app.ai.agenda import ActionItem, AgendaItem
from app.schemas.meeting import format_utc_datetime, require_utc_datetime

MAX_AI_SUGGESTION_BYTES = 20 * 1024


class AgendaIn(BaseModel):
    title: str | None = None
    starts_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=600)
    items: list[AgendaItem] = Field(min_length=1)
    action_items: list[ActionItem] = []
    ai_suggestion: dict | None = None
    ai_model: str | None = Field(default=None, max_length=100)
    ai_prompt_version: str | None = Field(default=None, max_length=50)

    @field_validator("starts_at", mode="before")
    @classmethod
    def utc_or_null(cls, value: object) -> object:
        return None if value is None else require_utc_datetime(value)

    @field_validator("ai_suggestion")
    @classmethod
    def limit_ai_suggestion(cls, value: dict | None) -> dict | None:
        if value is not None:
            size = len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
            if size > MAX_AI_SUGGESTION_BYTES:
                raise ValueError(f"must be at most {MAX_AI_SUGGESTION_BYTES} bytes")
        return value


class AgendaOut(AgendaIn):
    id: uuid.UUID
    meeting_id: uuid.UUID
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("starts_at", "updated_at")
    def serialize_utc_datetime(self, value: datetime | None) -> str | None:
        return None if value is None else format_utc_datetime(value)
