import copy
import dataclasses
from datetime import date
from types import SimpleNamespace

import pytest

from app.ai import agenda

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


def tool_response(payload, call_id="toolu_1", stop_reason="tool_use"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        usage=SimpleNamespace(input_tokens=1_000_000, output_tokens=100_000),
        content=[
            SimpleNamespace(type="thinking", thinking=""),
            SimpleNamespace(
                type="tool_use", id=call_id, name="record_agenda", input=payload
            ),
        ],
    )


def text_response(stop_reason="end_turn"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        usage=SimpleNamespace(input_tokens=1_000_000, output_tokens=100_000),
        content=[SimpleNamespace(type="text", text="No agenda here.")],
    )


class FakeMessages:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def create(self, **kwargs):
        # Snapshot: parse_agenda appends to the same list between attempts.
        self.calls.append(copy.deepcopy(kwargs))
        return self.responses.pop(0)


@pytest.fixture(autouse=True)
def claude_model(monkeypatch):
    # The default model is Nova now; these tests cover the Anthropic provider.
    monkeypatch.setattr(
        agenda,
        "settings",
        dataclasses.replace(agenda.settings, parser_model="anthropic.claude-opus-5-5"),
    )


@pytest.fixture
def fake(monkeypatch):
    holder = SimpleNamespace(messages=None)

    def install(*responses):
        holder.messages = FakeMessages(*responses)
        monkeypatch.setattr(
            agenda, "_client", lambda: SimpleNamespace(messages=holder.messages)
        )
        return holder.messages

    return install


def test_success(fake):
    messages = fake(tool_response(VALID))
    result = agenda.parse_agenda(TEXT, TODAY, "Europe/Kyiv")

    assert result.agenda == VALID
    assert result.provider == "anthropic"
    assert result.prompt_version == agenda.PROMPT_VERSION == "agenda-v3"
    assert result.usage.cost_usd == 6.0  # 1M in * $4 + 0.1M out * $20

    (call,) = messages.calls
    assert call["tools"] == [agenda.RECORD_AGENDA]
    assert call["system"] == agenda.SYSTEM
    assert call["output_config"] == {"effort": "low"}
    assert call["max_tokens"] == 4096
    content = call["messages"][0]["content"]
    assert content.startswith("Today is Wednesday 2026-10-28, time zone Europe/Kyiv.")
    assert f"<pasted_text>\n{TEXT}\n</pasted_text>" in content


def test_never_forces_the_tool(fake):
    messages = fake(tool_response(INVALID), tool_response(VALID))
    agenda.parse_agenda(TEXT, TODAY, "UTC")
    assert all("tool_choice" not in call for call in messages.calls)


def test_schema_is_the_parsed_agenda_schema():
    assert agenda.RECORD_AGENDA["name"] == "record_agenda"
    assert agenda.RECORD_AGENDA["input_schema"] == (
        agenda.ParsedAgenda.model_json_schema()
    )


def test_no_tool_use_raises_with_stop_reason(fake):
    fake(text_response(stop_reason="end_turn"))
    with pytest.raises(agenda.AgendaParseError, match="stop_reason=end_turn") as exc:
        agenda.parse_agenda("hello", TODAY, "UTC")
    assert exc.value.usage.input_tokens == 1_000_000


def test_invalid_then_valid_retries_once_and_sums_usage(fake):
    first = tool_response(INVALID, call_id="toolu_bad")
    messages = fake(first, tool_response(VALID, call_id="toolu_good"))

    result = agenda.parse_agenda(TEXT, TODAY, "Europe/Kyiv")

    assert result.agenda == VALID
    assert result.usage.input_tokens == 2_000_000
    assert result.usage.output_tokens == 200_000
    assert result.usage.cost_usd == 12.0
    retry = messages.calls[1]["messages"]
    assert retry[1] == {"role": "assistant", "content": first.content}
    (tool_result,) = retry[2]["content"]
    assert tool_result["type"] == "tool_result"
    assert tool_result["tool_use_id"] == "toolu_bad"
    assert tool_result["is_error"] is True
    assert "topic" in tool_result["content"]


def test_two_invalid_answers_raise(fake):
    messages = fake(tool_response(INVALID), tool_response(INVALID))
    with pytest.raises(agenda.AgendaParseError, match="twice") as exc:
        agenda.parse_agenda(TEXT, TODAY, "UTC")
    assert len(messages.calls) == agenda.MAX_ATTEMPTS == 2
    assert exc.value.usage.input_tokens == 2_000_000


@pytest.mark.parametrize(
    "payload",
    [
        {**VALID, "language": None},
        {k: v for k, v in VALID.items() if k != "language"},
        {**VALID, "duration_minutes": 0},
        {**VALID, "action_items": [{"task": "x", "due": "next Friday"}]},
        {**VALID, "items": [{"topic": "x", "minutes": 481}]},
    ],
)
def test_schema_rejects(payload):
    with pytest.raises(Exception):
        agenda.ParsedAgenda.model_validate(payload)


def test_unknown_model_has_no_cost(fake, monkeypatch):
    monkeypatch.setattr(
        agenda,
        "settings",
        dataclasses.replace(agenda.settings, parser_model="anthropic.unknown"),
    )
    fake(tool_response(VALID))
    assert agenda.parse_agenda("t", TODAY, "UTC").usage.cost_usd is None
