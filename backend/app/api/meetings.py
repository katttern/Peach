from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.models.meeting import Meeting
from app.schemas.meeting import CreateMeeting, MeetingResponse

router = APIRouter(tags=["meetings"])


@router.get("/meetings", response_model=list[MeetingResponse])
def list_meetings(session: Session = Depends(get_session)) -> list[Meeting]:
    return list(session.scalars(select(Meeting).order_by(Meeting.starts_at)))


@router.post(
    "/meetings", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED
)
def create_meeting(
    payload: CreateMeeting, session: Session = Depends(get_session)
) -> Meeting:
    meeting = Meeting(**payload.model_dump())
    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    return meeting
