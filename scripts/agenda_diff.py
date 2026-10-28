#!/usr/bin/env python3
"""Field-level diff between a model suggestion and the agenda a person saved.

Reads saved agendas as returned by GET /api/meetings/{id}/agenda (JSON files) and
compares every field of `ai_suggestion` with the saved value. This is the metric
from docs/lab6/answers.md §4, run here on whatever agendas you pass in.

  python3 scripts/agenda_diff.py docs/lab6/saved-agendas/<meeting-id>.json ...

Categories per field:
  unchanged  suggested value kept as is
  changed    suggested non-empty, saved a different non-empty value
  erased     suggested non-empty, saved empty
  added      suggested empty, saved non-empty (the person filled a gap)
Rows that exist on only one side count every field of the row as erased / added.
starts_at is compared as an instant (the model sends +02:00, the API stores Z).
"""

import json
import sys
from datetime import datetime

ROWS = {"items": ("topic", "owner", "minutes"), "action_items": ("task", "owner", "due")}
TOP = ("title", "starts_at", "duration_minutes")


def _empty(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _same(field: str, a, b) -> bool:
    if field == "starts_at" and not _empty(a) and not _empty(b):
        parse = lambda v: datetime.fromisoformat(v.replace("Z", "+00:00"))  # noqa: E731
        return parse(a) == parse(b)
    return a == b


def _classify(field: str, suggested, saved) -> str:
    if _empty(suggested) and _empty(saved):
        return "unchanged"
    if _same(field, suggested, saved):
        return "unchanged"
    if _empty(saved):
        return "erased"
    if _empty(suggested):
        return "added"
    return "changed"


def diff(agenda: dict) -> list[tuple[str, object, object, str]]:
    suggestion = agenda["ai_suggestion"]
    out = []
    for field in TOP:
        s, v = suggestion.get(field), agenda.get(field)
        out.append((field, s, v, _classify(field, s, v)))
    for rows, keys in ROWS.items():
        s_rows, v_rows = suggestion.get(rows, []), agenda.get(rows, [])
        for i in range(max(len(s_rows), len(v_rows))):
            s_row = s_rows[i] if i < len(s_rows) else {}
            v_row = v_rows[i] if i < len(v_rows) else {}
            for key in keys:
                path = f"{rows}.{i}.{key}"
                s, v = s_row.get(key), v_row.get(key)
                out.append((path, s, v, _classify(path, s, v)))
    return out


def main(paths: list[str]) -> None:
    totals = {"unchanged": 0, "changed": 0, "erased": 0, "added": 0}
    untouched = 0
    for path in paths:
        agenda = json.load(open(path, encoding="utf-8"))
        rows = diff(agenda)
        edits = [r for r in rows if r[3] != "unchanged"]
        untouched += not edits
        for r in rows:
            totals[r[3]] += 1
        print(f"### {agenda['meeting_id']}  ({agenda['ai_model']}, {agenda['ai_prompt_version']})")
        print(f"{len(rows) - len(edits)}/{len(rows)} fields unchanged")
        for field, s, v, kind in edits:
            print(f"  {kind:8} {field}: {json.dumps(s, ensure_ascii=False)} -> "
                  f"{json.dumps(v, ensure_ascii=False)}")
    n = sum(totals.values())
    print("### totals")
    for kind, count in totals.items():
        print(f"{kind:9} {count}/{n} = {count / n:.1%}")
    print(f"agendas saved without any edit: {untouched}/{len(paths)}")


if __name__ == "__main__":
    main(sys.argv[1:])
