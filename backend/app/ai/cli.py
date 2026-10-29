"""Local developer commands behind `make llm-hello` and `make parse`.

Uses the caller's AWS credentials; nothing here touches the database.
  python -m app.ai.cli hello
  python -m app.ai.cli parse "<text>"
"""

import json
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from app.ai.agenda import (
    AgendaParseError,
    _bedrock_runtime,
    _client,
    parse_agenda,
    provider_for,
)
from app.settings import settings

TZ = "Europe/Kyiv"


QUESTION = "In one sentence: what is an ISO week?"


def hello() -> None:
    model = settings.parser_model
    if provider_for(model) == "anthropic":
        response = _client().messages.create(
            model=model,
            max_tokens=1024,
            messages=[{"role": "user", "content": QUESTION}],
        )
        text = "".join(b.text for b in response.content if b.type == "text")
        stop, tokens = response.stop_reason, (
            response.usage.input_tokens,
            response.usage.output_tokens,
        )
    else:
        response = _bedrock_runtime().converse(
            modelId=model,
            messages=[{"role": "user", "content": [{"text": QUESTION}]}],
            inferenceConfig={"maxTokens": 256, "temperature": 0},
        )
        blocks = response["output"]["message"]["content"]
        text = "".join(b.get("text", "") for b in blocks)
        stop = response["stopReason"]
        tokens = (response["usage"]["inputTokens"], response["usage"]["outputTokens"])
    print(f"model:       {model} ({provider_for(model)})")
    print(f"text:        {text}")
    print(f"stop_reason: {stop}")
    print(f"usage:       input_tokens={tokens[0]} output_tokens={tokens[1]}")


def parse(text: str) -> int:
    today = datetime.now(ZoneInfo(TZ)).date()
    model = settings.parser_model
    print(f"model: {model} ({provider_for(model)})")
    print(f"today: {today:%A} {today}  tz: {TZ}")
    started = time.monotonic()
    try:
        result = parse_agenda(text, today, TZ)
    except AgendaParseError as exc:
        print(f"AgendaParseError: {exc}  usage: {exc.usage}")
        return 1
    latency = time.monotonic() - started
    print(json.dumps(result.agenda, ensure_ascii=False, indent=2))
    print(
        f"prompt_version={result.prompt_version} "
        f"input_tokens={result.usage.input_tokens} "
        f"output_tokens={result.usage.output_tokens} "
        f"cost_usd={result.usage.cost_usd} latency_s={latency:.2f}"
    )
    return 0


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "hello":
        hello()
    elif command == "parse" and len(sys.argv) == 3:
        sys.exit(parse(sys.argv[2]))
    else:
        sys.exit(__doc__)
