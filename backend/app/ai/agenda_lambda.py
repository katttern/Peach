"""Lambda Function URL handler (payload 2.0) for the agenda parser.

Runs outside the VPC with no database: never import app.db from here.
CORS headers come from the Function URL configuration, not from this code.
"""

import base64
import binascii
import json
import time
from datetime import date

import anthropic

from app.ai.agenda import (
    PROMPT_VERSION,
    AgendaParseError,
    ModelBusyError,
    ModelUnavailableError,
    parse_agenda,
    provider_for,
)
from app.auth import AuthError, verify_cognito_token
from app.settings import settings

MAX_TEXT_CHARS = 10_000


class BadRequest(Exception):
    pass


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }


def _read_body(event: dict) -> dict:
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        try:
            raw = base64.b64decode(raw, validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError) as exc:
            raise BadRequest("body is not valid base64 UTF-8") from exc
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise BadRequest("body must be JSON") from exc
    if not isinstance(payload, dict):
        raise BadRequest("body must be a JSON object")

    text, today, tz = payload.get("text"), payload.get("today"), payload.get("tz")
    if not isinstance(text, str):
        raise BadRequest("text must be a string")
    if not isinstance(today, str) or len(today) != 10:
        raise BadRequest("today must be YYYY-MM-DD")
    try:
        date.fromisoformat(today)
    except ValueError as exc:
        raise BadRequest("today must be YYYY-MM-DD") from exc
    if not isinstance(tz, str) or not tz.strip() or len(tz) > 64:
        raise BadRequest("tz must be an IANA time zone name")
    return {"text": text, "today": today, "tz": tz.strip()}


def _log(record: dict) -> None:
    # One JSON object per line on stdout, so Logs Insights parses the fields.
    print(json.dumps(record, ensure_ascii=False), flush=True)


def handler(event, context):
    started = time.monotonic()
    record = {
        "event": "agenda_parse_failed",
        "user": None,
        "provider": provider_for(settings.parser_model),
        "model": settings.parser_model,
        "prompt_version": None,
        "input_tokens": None,
        "output_tokens": None,
        "latency_ms": None,
        "cost_usd": None,
        "status": None,
    }

    def finish(status: int, body: dict, usage=None) -> dict:
        if usage is not None:
            record["input_tokens"] = usage.input_tokens
            record["output_tokens"] = usage.output_tokens
            record["cost_usd"] = usage.cost_usd
        record["status"] = status
        record["latency_ms"] = round((time.monotonic() - started) * 1000)
        _log(record)
        return _response(status, body)

    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    try:
        claims = verify_cognito_token(headers.get("authorization"))
    except AuthError:
        return finish(401, {"error": "unauthorized"})
    record["user"] = claims.sub

    try:
        request = _read_body(event)
    except BadRequest as exc:
        return finish(400, {"error": str(exc)})
    if not request["text"].strip():
        return finish(400, {"error": "text is empty"})
    if len(request["text"]) > MAX_TEXT_CHARS:
        return finish(413, {"error": f"text is longer than {MAX_TEXT_CHARS} chars"})

    record["prompt_version"] = PROMPT_VERSION
    try:
        result = parse_agenda(
            request["text"], date.fromisoformat(request["today"]), request["tz"]
        )
    except AgendaParseError as exc:
        return finish(422, {"error": "could not read an agenda"}, exc.usage)
    except (anthropic.RateLimitError, anthropic.OverloadedError, ModelBusyError):
        return finish(429, {"error": "busy"})
    except ModelUnavailableError as exc:
        record["error"] = str(exc)
        return finish(502, {"error": "model unavailable"})
    except anthropic.APIError as exc:
        record["error"] = type(exc).__name__
        return finish(502, {"error": "model unavailable"})

    record["event"] = "agenda_parsed"
    record["provider"] = result.provider
    record["model"] = result.model
    record["prompt_version"] = result.prompt_version
    return finish(
        200,
        {
            "agenda": result.agenda,
            "model": result.model,
            "prompt_version": result.prompt_version,
        },
        result.usage,
    )
