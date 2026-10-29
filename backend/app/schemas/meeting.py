import re
import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, field_serializer, field_validator


def require_utc_datetime(value: object) -> object:
    """Accept only UTC datetimes or strings in YYYY-MM-DDTHH:MM:SSZ form."""
    if isinstance(value, datetime):
        if value.tzinfo is None or value.utcoffset() != timezone.utc.utcoffset(value):
            raise ValueError("must be a UTC datetime")
        return value
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value
    ):
        raise ValueError("must use YYYY-MM-DDTHH:MM:SSZ UTC format")
    return value


def format_utc_datetime(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class CreateMeeting(BaseModel):
    title: str
    starts_at: datetime
    ends_at: datetime
    attendee_count: int

    _utc = field_validator("starts_at", "ends_at", mode="before")(
        require_utc_datetime
    )


class MeetingResponse(CreateMeeting):
    id: uuid.UUID

    model_config = {"from_attributes": True}

    @field_serializer("starts_at", "ends_at")
    def serialize_utc_datetime(self, value: datetime) -> str:
        return format_utc_datetime(value)
