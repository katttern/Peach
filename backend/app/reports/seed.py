from datetime import timedelta

from app.db.session import SessionLocal
from app.models.meeting import Meeting
from app.reports.weekly import week_bounds


def seed_demo_data(week: str) -> int:
    """Insert demo meetings into `week` and the week before it."""
    start, _ = week_bounds(week)
    rows = []
    for base, n in ((start, 5), (start - timedelta(days=7), 3)):
        for i in range(n):
            s = base + timedelta(days=i, hours=9 + i)
            rows.append(
                Meeting(
                    title=f"Demo meeting {i + 1}",
                    starts_at=s,
                    ends_at=s + timedelta(minutes=30 * (i + 1)),
                    attendee_count=2 + i,
                )
            )
    with SessionLocal() as session:
        session.add_all(rows)
        session.commit()
    return len(rows)
