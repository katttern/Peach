import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.auth import Claims, require_user
from app.db.session import get_session
from app.models.agenda import Agenda
from app.models.meeting import Meeting
from app.schemas.agenda import AgendaIn, AgendaOut

router = APIRouter(tags=["agenda"])


def _require_meeting(session: Session, meeting_id: uuid.UUID, user: Claims) -> None:
    # Someone else's meeting is reported as missing (404, not 403) so its
    # existence is not revealed.
    owned = session.scalar(
        select(Meeting.id).where(
            Meeting.id == meeting_id, Meeting.owner_sub == user.sub
        )
    )
    if owned is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "meeting not found")


@router.get("/meetings/{meeting_id}/agenda", response_model=AgendaOut)
def get_agenda(
    meeting_id: uuid.UUID,
    session: Session = Depends(get_session),
    user: Claims = Depends(require_user),
) -> Agenda:
    _require_meeting(session, meeting_id, user)
    agenda = session.scalar(select(Agenda).where(Agenda.meeting_id == meeting_id))
    if agenda is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agenda not found")
    return agenda


@router.put("/meetings/{meeting_id}/agenda", response_model=AgendaOut)
def put_agenda(
    meeting_id: uuid.UUID,
    payload: AgendaIn,
    session: Session = Depends(get_session),
    user: Claims = Depends(require_user),
) -> Agenda:
    _require_meeting(session, meeting_id, user)
    values = payload.model_dump(mode="json", exclude={"starts_at"})
    values["starts_at"] = payload.starts_at
    # One agenda per meeting: insert, or overwrite the existing one in place.
    # created_by keeps the first author; later saves only bump updated_at.
    statement = (
        insert(Agenda)
        .values(id=uuid.uuid4(), meeting_id=meeting_id, created_by=user.sub, **values)
        .on_conflict_do_update(
            index_elements=[Agenda.meeting_id],
            set_={**values, "updated_at": func.now()},
        )
        .returning(Agenda.id)
    )
    agenda_id = session.scalar(statement)
    session.commit()
    return session.get(Agenda, agenda_id, populate_existing=True)
