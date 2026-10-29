import copy
import dataclasses
import json
from datetime import date

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError

from app.ai import agenda, agenda_lambda
from app.auth import Claims

MODEL = "us.amazon.nova-pro-v1:0"
TODAY = date(2026, 10, 28)  # a Wednesday
# Pasted text that really contains the values in VALID (v3 checks owners and
# deadlines against it).
TEXT = "Порядок: огляд беклогу (Оля, 15 хв). Іван: оновити дошку до п'ятниці."

VALID = {
    "title": "Планування спринту",
    "starts_at": "2026-11-02T10:00:00+02:00",
    "duration_minutes": 60,
    "items": [{"topic": "Огляд беклогу", "owner": "Оля", "minutes": 15}],
    "action_items": [{"task": "Оновити дошку", "owner": "Іван", "due": "2026-10-30"}],
    "language": "uk",
}
INVALID = {**VALID, "items": [{"topic": "", "minutes": 900}]}


def tool_reply(payload, tool_use_id="tooluse_1", stop="tool_use"):
    return {
        "output": {
            "message": {
                "role": "assistant",
                "content": [
                    {
                        "toolUse": {
                            "toolUseId": tool_use_id,
                            "name": "record_agenda",
                            "input": payload,
                        }
                    }
                ],
            }
        },
        "stopReason": stop,
        "usage": {"inputTokens": 1_000_000, "outputTokens": 100_000},
    }


def text_reply(stop="end_turn"):
    return {
        "output": {"message": {"role": "assistant", "content": [{"text": "Hi"}]}},
        "stopReason": stop,
        "usage": {"inputTokens": 1_000_000, "outputTokens": 100_000},
    }


def throttled():
    return ClientError(
        {"Error": {"Code": "ThrottlingException", "Message": "Too many requests"}},
        "Converse",
    )


class FakeRuntime:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []

    def converse(self, **kwargs):
        self.calls.append(copy.deepcopy(kwargs))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


@pytest.fixture
def runtime(monkeypatch):
    monkeypatch.setattr(
        agenda, "settings", dataclasses.replace(agenda.settings, parser_model=MODEL)
    )

    def install(*replies):
        fake = FakeRuntime(*replies)
        monkeypatch.setattr(agenda, "_bedrock_runtime", lambda: fake)
        return fake

    return install


def test_provider_is_chosen_by_prefix():
    assert agenda.provider_for("anthropic.claude-opus-5-5") == "anthropic"
    assert agenda.provider_for("us.amazon.nova-pro-v1:0") == "converse"
    assert agenda.provider_for("us.amazon.nova-lite-v1:0") == "converse"


def test_success(runtime):
    fake = runtime(tool_reply(VALID))
    result = agenda.parse_agenda(TEXT, TODAY, "Europe/Kyiv")

    assert result.agenda == VALID
    assert result.provider == "converse"
    assert result.model == MODEL
    assert result.usage.cost_usd == 1.12  # 1M in * $0.80 + 0.1M out * $3.20

    (call,) = fake.calls
    assert call["modelId"] == MODEL
    assert call["system"] == [{"text": agenda.SYSTEM}]
    assert call["inferenceConfig"] == {"maxTokens": 4096, "temperature": 0}
    (tool,) = call["toolConfig"]["tools"]
    assert tool["toolSpec"]["name"] == "record_agenda"
    assert tool["toolSpec"]["inputSchema"] == {
        "json": agenda.ParsedAgenda.model_json_schema()
    }
    assert call["toolConfig"]["toolChoice"] == {"tool": {"name": "record_agenda"}}
    text = call["messages"][0]["content"][0]["text"]
    assert text.startswith("Today is Wednesday 2026-10-28, time zone Europe/Kyiv.")
    assert f"<pasted_text>\n{TEXT}\n</pasted_text>" in text


def test_no_tool_use_raises(runtime):
    runtime(text_reply(stop="end_turn"))
    with pytest.raises(agenda.AgendaParseError, match="stopReason=end_turn") as exc:
        agenda.parse_agenda("hi", TODAY, "UTC")
    assert exc.value.usage.input_tokens == 1_000_000


def test_tool_use_with_wrong_stop_reason_raises(runtime):
    runtime(tool_reply(VALID, stop="max_tokens"))
    with pytest.raises(agenda.AgendaParseError, match="stopReason=max_tokens"):
        agenda.parse_agenda("hi", TODAY, "UTC")


def test_invalid_then_valid_retries_with_error_tool_result(runtime):
    first = tool_reply(INVALID, tool_use_id="tooluse_bad")
    fake = runtime(first, tool_reply(VALID, tool_use_id="tooluse_good"))

    result = agenda.parse_agenda(TEXT, TODAY, "Europe/Kyiv")

    assert result.agenda == VALID
    assert (result.usage.input_tokens, result.usage.output_tokens) == (
        2_000_000,
        200_000,
    )
    assert result.usage.cost_usd == 2.24
    retry = fake.calls[1]["messages"]
    assert retry[1] == first["output"]["message"]
    (block,) = retry[2]["content"]
    tool_result = block["toolResult"]
    assert tool_result["toolUseId"] == "tooluse_bad"
    assert tool_result["status"] == "error"
    assert "topic" in tool_result["content"][0]["text"]


def test_two_invalid_answers_raise(runtime):
    fake = runtime(tool_reply(INVALID), tool_reply(INVALID))
    with pytest.raises(agenda.AgendaParseError, match="twice") as exc:
        agenda.parse_agenda(TEXT, TODAY, "UTC")
    assert len(fake.calls) == 2
    assert exc.value.usage.output_tokens == 200_000


def test_throttling_is_busy(runtime):
    runtime(throttled())
    with pytest.raises(agenda.ModelBusyError):
        agenda.parse_agenda(TEXT, TODAY, "UTC")


@pytest.mark.parametrize(
    "error, code",
    [
        (
            ClientError(
                {"Error": {"Code": "AccessDeniedException", "Message": "no"}},
                "Converse",
            ),
            "AccessDeniedException",
        ),
        (EndpointConnectionError(endpoint_url="https://x"), "EndpointConnectionError"),
    ],
)
def test_other_failures_are_unavailable(runtime, error, code):
    runtime(error)
    with pytest.raises(agenda.ModelUnavailableError, match=code):
        agenda.parse_agenda(TEXT, TODAY, "UTC")


def test_throttling_reaches_the_browser_as_429(runtime, monkeypatch, capsys):
    """End to end through the real handler and parse_agenda."""
    runtime(throttled())
    monkeypatch.setattr(
        agenda_lambda,
        "verify_cognito_token",
        lambda header: Claims(sub="user-123", email=None, token_use="access"),
    )
    monkeypatch.setattr(
        agenda_lambda, "settings", dataclasses.replace(agenda.settings)
    )
    event = {
        "headers": {"authorization": "Bearer good"},
        "body": json.dumps({"text": "x", "today": "2026-10-28", "tz": "UTC"}),
        "isBase64Encoded": False,
    }
    response = agenda_lambda.handler(event, None)
    log = json.loads(capsys.readouterr().out.strip())
    assert response["statusCode"] == 429
    assert json.loads(response["body"]) == {"error": "busy"}
    assert (log["provider"], log["status"]) == ("converse", 429)
