"""Meetings and agenda API tests against a real PostgreSQL (JSONB, ON CONFLICT).

Run with TEST_DATABASE_URL pointing at a disposable database, e.g.
  docker run --rm -d -p 55432:5432 -e POSTGRES_USER=spry -e POSTGRES_PASSWORD=spry \
    -e POSTGRES_DB=spry postgres:16.4-bookworm
  TEST_DATABASE_URL=postgresql+psycopg://spry:spry@localhost:55432/spry pytest
"""

import os
from pathlib import Path

import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    pytest.skip("TEST_DATABASE_URL is not set", allow_module_level=True)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.auth import Claims, require_user  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
ITEMS = [{"topic": "Огляд беклогу", "owner": "Оля", "minutes": 15}]
ACTIONS = [{"task": "Оновити дошку", "owner": None, "due": "2026-10-30"}]


@pytest.fixture(scope="module", autouse=True)
def migrated():
    cwd = os.getcwd()
    os.chdir(BACKEND)
    try:
        command.upgrade(Config("alembic.ini"), "head")
    finally:
        os.chdir(cwd)


@pytest.fixture(autouse=True)
def clean():
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE meetings CASCADE"))
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


MEETING = {
    "title": "Планування",
    "starts_at": "2026-10-29T09:00:00Z",
    "ends_at": "2026-10-29T10:00:00Z",
    "attendee_count": 4,
}


def sign_in(sub):
    """Act as `sub` for the following requests (stands in for a valid token)."""
    app.dependency_overrides[require_user] = lambda: Claims(
        sub=sub, email=None, token_use="access"
    )


def sign_out():
    app.dependency_overrides.pop(require_user, None)


@pytest.fixture
def user():
    sign_in("user-123")


@pytest.fixture
def meeting_id(client, user):
    response = client.post("/api/meetings", json=MEETING)
    assert response.status_code == 201
    return response.json()["id"]


def agenda(**overrides):
    return {"title": "Спринт 12", "items": ITEMS, "action_items": ACTIONS, **overrides}


def test_put_creates_then_updates(client, user, meeting_id):
    url = f"/api/meetings/{meeting_id}/agenda"
    created = client.put(url, json=agenda(starts_at="2026-10-29T09:00:00Z"))
    assert created.status_code == 200
    first = created.json()
    assert first["meeting_id"] == meeting_id
    assert first["items"] == ITEMS and first["action_items"] == ACTIONS
    assert first["starts_at"] == "2026-10-29T09:00:00Z"

    updated = client.put(url, json=agenda(title="Спринт 13", duration_minutes=45))
    assert updated.status_code == 200
    second = updated.json()
    assert second["id"] == first["id"]
    assert second["title"] == "Спринт 13"
    assert second["duration_minutes"] == 45
    assert second["starts_at"] is None
    assert second["updated_at"] >= first["updated_at"]

    fetched = client.get(url)
    assert fetched.status_code == 200
    assert fetched.json() == second
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT count(*), max(created_by) FROM agendas"))
        assert rows.one() == (1, "user-123")


def test_ai_suggestion_is_stored(client, user, meeting_id):
    suggestion = {"agenda": {"items": ITEMS}, "note": "запропоновано моделлю"}
    response = client.put(
        f"/api/meetings/{meeting_id}/agenda",
        json=agenda(
            ai_suggestion=suggestion,
            ai_model="anthropic.claude-opus-5-5",
            ai_prompt_version="agenda-v1",
        ),
    )
    assert response.status_code == 200
    body = client.get(f"/api/meetings/{meeting_id}/agenda").json()
    assert body["ai_suggestion"] == suggestion
    assert body["ai_model"] == "anthropic.claude-opus-5-5"
    assert body["ai_prompt_version"] == "agenda-v1"


def test_get_404_without_meeting(client, user):
    url = "/api/meetings/00000000-0000-0000-0000-000000000000/agenda"
    assert client.get(url).status_code == 404


def test_get_404_without_agenda(client, user, meeting_id):
    assert client.get(f"/api/meetings/{meeting_id}/agenda").status_code == 404


def test_put_404_without_meeting(client, user):
    url = "/api/meetings/00000000-0000-0000-0000-000000000000/agenda"
    assert client.put(url, json=agenda()).status_code == 404


@pytest.mark.parametrize("method", ["get", "put"])
def test_401_without_token(client, meeting_id, method):
    sign_out()
    url = f"/api/meetings/{meeting_id}/agenda"
    response = client.put(url, json=agenda()) if method == "put" else client.get(url)
    assert response.status_code == 401


@pytest.mark.parametrize(
    "payload",
    [
        agenda(items=[]),
        agenda(ai_suggestion={"blob": "я" * 11_000}),  # > 20 KB as UTF-8
        agenda(duration_minutes=0),
        agenda(duration_minutes=601),
        agenda(items=[{"topic": "", "owner": None, "minutes": None}]),
        agenda(items=[{"topic": "x", "owner": None, "minutes": 481}]),
        agenda(action_items=[{"task": "x", "owner": None, "due": "Friday"}]),
        agenda(starts_at="2026-10-29T09:00:00+02:00"),
        agenda(ai_model="m" * 101),
        agenda(ai_prompt_version="v" * 51),
    ],
)
def test_validation_422(client, user, meeting_id, payload):
    response = client.put(f"/api/meetings/{meeting_id}/agenda", json=payload)
    assert response.status_code == 422


def test_cascade_delete(client, user, meeting_id):
    client.put(f"/api/meetings/{meeting_id}/agenda", json=agenda())
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM meetings"))
        assert conn.execute(text("SELECT count(*) FROM agendas")).scalar() == 0


# ---------- meetings belong to their owner ----------


@pytest.mark.parametrize("method", ["get", "post"])
def test_meetings_401_without_token(client, method):
    response = (
        client.post("/api/meetings", json=MEETING)
        if method == "post"
        else client.get("/api/meetings")
    )
    assert response.status_code == 401


def test_post_sets_owner_sub(client):
    sign_in("user-a")
    created = client.post("/api/meetings", json=MEETING)
    assert created.status_code == 201
    assert "owner_sub" not in created.json()  # internal, not part of the contract
    with engine.connect() as conn:
        owner = conn.execute(
            text("SELECT owner_sub FROM meetings WHERE id = :id"),
            {"id": created.json()["id"]},
        ).scalar_one()
    assert owner == "user-a"


def test_users_only_see_their_own_meetings(client):
    sign_in("user-a")
    a_id = client.post("/api/meetings", json={**MEETING, "title": "A"}).json()["id"]
    sign_in("user-b")
    b_id = client.post("/api/meetings", json={**MEETING, "title": "B"}).json()["id"]

    assert [m["id"] for m in client.get("/api/meetings").json()] == [b_id]
    sign_in("user-a")
    assert [m["id"] for m in client.get("/api/meetings").json()] == [a_id]
    sign_in("user-c")
    assert client.get("/api/meetings").json() == []


def test_someone_elses_agenda_is_404(client):
    sign_in("user-b")
    b_id = client.post("/api/meetings", json=MEETING).json()["id"]
    url = f"/api/meetings/{b_id}/agenda"
    assert client.put(url, json=agenda()).status_code == 200

    sign_in("user-a")
    get = client.get(url)
    put = client.put(url, json=agenda(title="hijacked"))
    assert (get.status_code, put.status_code) == (404, 404)
    assert get.json() == put.json() == {"detail": "meeting not found"}

    sign_in("user-b")
    assert client.get(url).json()["title"] == "Спринт 12"  # untouched


def test_legacy_rows_stay_invisible(client):
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO meetings (id, title, starts_at, ends_at, attendee_count,"
                " owner_sub) VALUES (gen_random_uuid(), 'old', now(), now(), 1,"
                " 'legacy')"
            )
        )
    sign_in("user-a")
    assert client.get("/api/meetings").json() == []


def test_seed_owns_rows_and_report_still_builds():
    from app.reports.seed import seed_demo_data
    from app.reports.weekly import build_weekly_report

    assert seed_demo_data("2026-W44", "demo-owner") == 8
    with engine.connect() as conn:
        owners = conn.execute(text("SELECT DISTINCT owner_sub FROM meetings")).all()
    assert owners == [("demo-owner",)]
    # The weekly report still aggregates across all owners.
    assert b"meetings,5,3,2" in build_weekly_report("2026-W44")
