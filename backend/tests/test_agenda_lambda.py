import base64
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

import anthropic
import httpx2
import pytest

from app.ai import agenda_lambda
from app.ai.agenda import (
    AgendaParseError,
    ModelBusyError,
    ModelUnavailableError,
    ParseResult,
    Usage,
)
from app.auth import AuthError, Claims

AGENDA = {
    "title": "Планування спринту",
    "items": [{"topic": "Огляд беклогу", "owner": "Оля", "minutes": 15}],
    "action_items": [{"task": "Оновити дошку", "owner": "Іван", "due": "2026-10-30"}],
    "language": "uk",
}
BODY = {
    "text": "Привіт! Завтра планування: беклог (Оля, 15 хв).",
    "today": "2026-10-28",
    "tz": "Europe/Kyiv",
}


def event(body=BODY, token="Bearer good", b64=False):
    raw = body if isinstance(body, str) else json.dumps(body, ensure_ascii=False)
    if b64:
        raw = base64.b64encode(raw.encode()).decode()
    headers = {"content-type": "application/json"}
    if token is not None:
        headers["authorization"] = token
    return {"version": "2.0", "headers": headers, "body": raw, "isBase64Encoded": b64}


def api_error(cls, status):
    request = httpx2.Request("POST", "https://bedrock-mantle.us-east-1.api.aws/")
    return cls("boom", response=httpx2.Response(status, request=request), body=None)


@pytest.fixture
def calls(monkeypatch):
    seen = []

    def fake_verify(header):
        if header != "Bearer good":
            raise AuthError("bad")
        return Claims(sub="user-123", email=None, token_use="access")

    def fake_parse(text, today, tz):
        seen.append((text, today, tz))
        return ParseResult(
            agenda=AGENDA,
            model="anthropic.claude-opus-5-5",
            prompt_version="agenda-v1",
            usage=Usage(input_tokens=500, output_tokens=120, cost_usd=0.0044),
            provider="anthropic",
        )

    monkeypatch.setattr(agenda_lambda, "verify_cognito_token", fake_verify)
    monkeypatch.setattr(agenda_lambda, "parse_agenda", fake_parse)
    return seen


def call(evt, capsys):
    response = agenda_lambda.handler(evt, None)
    lines = capsys.readouterr().out.strip().splitlines()
    assert len(lines) == 1, "exactly one log line per invocation"
    return response, json.loads(response["body"]), json.loads(lines[0])


def test_ok(calls, capsys):
    response, body, log = call(event(), capsys)
    assert response["statusCode"] == 200
    assert body == {"agenda": AGENDA, "model": "anthropic.claude-opus-5-5",
                    "prompt_version": "agenda-v1"}
    assert "access-control-allow-origin" not in {k.lower() for k in response["headers"]}
    assert calls == [(BODY["text"], date(2026, 10, 28), "Europe/Kyiv")]
    assert log["event"] == "agenda_parsed"
    assert log["provider"] == "anthropic"
    assert log["user"] == "user-123"
    assert (log["input_tokens"], log["output_tokens"], log["cost_usd"]) == (
        500, 120, 0.0044)
    assert log["status"] == 200 and isinstance(log["latency_ms"], int)


def test_base64_body(calls, capsys):
    response, _, _ = call(event(b64=True), capsys)
    assert response["statusCode"] == 200


@pytest.mark.parametrize("token", [None, "Bearer bad", "garbage"])
def test_unauthorized(calls, capsys, token):
    response, body, log = call(event(token=token), capsys)
    assert response["statusCode"] == 401
    assert log["event"] == "agenda_parse_failed" and log["user"] is None
    assert calls == []


@pytest.mark.parametrize(
    "body",
    [
        "{not json",
        "[1, 2]",
        {"today": "2026-10-28", "tz": "Europe/Kyiv"},
        {"text": "hi", "tz": "Europe/Kyiv"},
        {"text": "hi", "today": "28.10.2026", "tz": "Europe/Kyiv"},
        {"text": "hi", "today": "2026-02-30", "tz": "Europe/Kyiv"},
        {"text": "hi", "today": "2026-10-28"},
        {"text": "   ", "today": "2026-10-28", "tz": "Europe/Kyiv"},
    ],
)
def test_bad_request(calls, capsys, body):
    response, _, log = call(event(body=body), capsys)
    assert response["statusCode"] == 400
    assert log["status"] == 400 and log["user"] == "user-123"
    assert calls == []


def test_bad_base64(calls, capsys):
    evt = event()
    evt["isBase64Encoded"] = True
    evt["body"] = "%%%"
    response, _, _ = call(evt, capsys)
    assert response["statusCode"] == 400


def test_too_long_is_rejected_before_the_model(calls, capsys):
    response, _, _ = call(event(body={**BODY, "text": "я" * 10_001}), capsys)
    assert response["statusCode"] == 413
    assert calls == []


def test_exactly_the_limit_is_accepted(calls, capsys):
    response, _, _ = call(event(body={**BODY, "text": "я" * 10_000}), capsys)
    assert response["statusCode"] == 200


def test_unparseable_agenda(calls, capsys, monkeypatch):
    def fail(*args):
        raise AgendaParseError("nope", Usage(10, 5, 0.0001))

    monkeypatch.setattr(agenda_lambda, "parse_agenda", fail)
    response, _, log = call(event(), capsys)
    assert response["statusCode"] == 422
    assert log["input_tokens"] == 10


@pytest.mark.parametrize(
    "error", [(anthropic.RateLimitError, 429), (anthropic.OverloadedError, 529)]
)
def test_busy(calls, capsys, monkeypatch, error):
    def fail(*args):
        raise api_error(*error)

    monkeypatch.setattr(agenda_lambda, "parse_agenda", fail)
    response, body, _ = call(event(), capsys)
    assert response["statusCode"] == 429
    assert body == {"error": "busy"}


@pytest.mark.parametrize(
    "exc",
    [
        api_error(anthropic.InternalServerError, 500),
        api_error(anthropic.PermissionDeniedError, 403),
        anthropic.APIConnectionError(request=httpx2.Request("POST", "https://x")),
    ],
)
def test_model_error_hides_details(calls, capsys, monkeypatch, exc):
    def fail(*args):
        raise exc

    monkeypatch.setattr(agenda_lambda, "parse_agenda", fail)
    response, body, _ = call(event(), capsys)
    assert response["statusCode"] == 502
    assert body == {"error": "model unavailable"}


def test_handler_module_does_not_import_db():
    env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
    code = (
        "import sys, app.ai.agenda_lambda; "
        "assert 'app.db.session' not in sys.modules, 'app.db leaked'"
    )
    subprocess.run(
        [sys.executable, "-c", code],
        cwd=Path(__file__).resolve().parents[1],
        env=env,
        check=True,
    )


def test_converse_busy_is_429(calls, capsys, monkeypatch):
    def fail(*args):
        raise ModelBusyError("ThrottlingException")

    monkeypatch.setattr(agenda_lambda, "parse_agenda", fail)
    response, body, _ = call(event(), capsys)
    assert (response["statusCode"], body) == (429, {"error": "busy"})


def test_converse_unavailable_is_502_without_details(calls, capsys, monkeypatch):
    def fail(*args):
        raise ModelUnavailableError("AccessDeniedException")

    monkeypatch.setattr(agenda_lambda, "parse_agenda", fail)
    response, body, log = call(event(), capsys)
    assert (response["statusCode"], body) == (502, {"error": "model unavailable"})
    assert log["error"] == "AccessDeniedException"


def test_every_log_line_names_the_provider(calls, capsys):
    _, _, log = call(event(token=None), capsys)
    assert log["provider"] in {"anthropic", "converse"}
