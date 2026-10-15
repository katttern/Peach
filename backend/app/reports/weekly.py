import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.meeting import Meeting


def previous_iso_week(today: date | None = None) -> str:
    today = today or datetime.now(timezone.utc).date()
    year, week, _ = (today - timedelta(days=7)).isocalendar()
    return f"{year}-W{week:02d}"


def week_bounds(week: str) -> tuple[datetime, datetime]:
    year, number = week.split("-W")
    monday = date.fromisocalendar(int(year), int(number), 1)
    start = datetime.combine(monday, time.min, tzinfo=timezone.utc)
    return start, start + timedelta(days=7)


def _totals(session: Session, start: datetime, end: datetime) -> tuple[int, float]:
    seconds = func.extract("epoch", Meeting.ends_at - Meeting.starts_at)
    count, total = session.execute(
        select(func.count(Meeting.id), func.coalesce(func.sum(seconds), 0)).where(
            Meeting.starts_at >= start, Meeting.starts_at < end
        )
    ).one()
    return int(count), round(float(total) / 3600, 2)


def build_weekly_report(week: str) -> bytes:
    """Return the CSV for one ISO week, e.g. "2026-W40"."""
    start, end = week_bounds(week)
    prev_start = start - timedelta(days=7)
    with SessionLocal() as session:
        count, hours = _totals(session, start, end)
        prev_count, prev_hours = _totals(session, prev_start, start)
        duration = Meeting.ends_at - Meeting.starts_at
        longest = (
            session.execute(
                select(Meeting)
                .where(Meeting.starts_at >= start, Meeting.starts_at < end)
                .order_by(duration.desc(), Meeting.starts_at, Meeting.id)
                .limit(5)
            )
            .scalars()
            .all()
        )
        out = io.StringIO()
        writer = csv.writer(out, lineterminator="\n")
        writer.writerow(["report_week", week])
        writer.writerow(["metric", "this_week", "previous_week", "change"])
        writer.writerow(["meetings", count, prev_count, count - prev_count])
        writer.writerow(
            ["total_hours", hours, prev_hours, round(hours - prev_hours, 2)]
        )
        writer.writerow([])
        writer.writerow(["rank", "title", "starts_at", "duration_hours", "attendees"])
        for rank, m in enumerate(longest, start=1):
            hrs = round((m.ends_at - m.starts_at).total_seconds() / 3600, 2)
            writer.writerow(
                [rank, m.title, m.starts_at.isoformat(), hrs, m.attendee_count]
            )
        return out.getvalue().encode("utf-8")
