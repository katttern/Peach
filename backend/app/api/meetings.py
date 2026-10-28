from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Claims, require_user
from app.db.session import get_session
from app.models.meeting import Meeting
from app.schemas.meeting import CreateMeeting, MeetingResponse

# Meetings belong to the signed-in user (Cognito sub); nobody sees anyone else's.
router = APIRouter(tags=["meetings"])


@router.get("/meetings", response_model=list[MeetingResponse])
def list_meetings(
    session: Session = Depends(get_session), user: Claims = Depends(require_user)
) -> list[Meeting]:
    return list(
        session.scalars(
            select(Meeting)
            .where(Meeting.owner_sub == user.sub)
            .order_by(Meeting.starts_at)
        )
    )


@router.post(
    "/meetings", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED
)
def create_meeting(
    payload: CreateMeeting,
    session: Session = Depends(get_session),
    user: Claims = Depends(require_user),
) -> Meeting:
    meeting = Meeting(**payload.model_dump(), owner_sub=user.sub)
    session.add(meeting)
    session.commit()
    session.refresh(meeting)
    return meeting
