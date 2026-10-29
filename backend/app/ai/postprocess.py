"""agenda-v3: deterministic fixes applied to the model's answer.

v2 results (docs/lab6/results/nova-pro-v1-prompt-v2) showed the prompt alone
cannot make the model resolve "до п'ятниці" / "by end of week", and that owners
can be transliterated ("Иван", "Ivan") or injected ("admin@example.com"). These
functions only look at the pasted text, so they are easy to test.

Text units:
  sentence  split on . ! ? ; and newlines; an owner must be named in a sentence
            that mentions the item (so "Tom, please send ..." keeps Tom).
  clause    a sentence further split on commas; a deadline phrase applies only
            to the action items mentioned in its own clause (so "Priya ... by
            end of week, Sam ... before the sync" does not give Sam Priya's date).
"""

import re
from datetime import date, timedelta

# Punctuation ends a unit only before whitespace or the end, so "admin@example.com"
# and "10,000" stay whole.
_SENTENCE = re.compile(r"[.!?;]+(?=\s|$)|\n+")
_CLAUSE = re.compile(r"[.!?;,]+(?=\s|$)|\n+")
_WORD = re.compile(r"[\w@.'’ʼ-]+")

# Monday=0 ... Sunday=6, as date.weekday().
_DEADLINES = [
    (re.compile(r"\bдо\s+понеділка\b"), 0),
    (re.compile(r"\bдо\s+вівторка\b"), 1),
    (re.compile(r"\bдо\s+середи\b"), 2),
    (re.compile(r"\bдо\s+четверга\b"), 3),
    (re.compile(r"\bдо\s+п['’ʼ`]?ятниці\b"), 4),
    (re.compile(r"\bдо\s+суботи\b"), 5),
    (re.compile(r"\bдо\s+неділі\b"), 6),
    (re.compile(r"\bдо\s+кінця\s+тижня\b"), 4),
    (re.compile(r"\bby\s+(?:the\s+)?end\s+of\s+(?:the\s+)?week\b"), 4),
]
_DEADLINES += [
    (re.compile(rf"\bby\s+{name}\b"), n)
    for n, name in enumerate(
        ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    )
]


def _norm(text: str) -> str:
    return " ".join(text.split()).casefold()


def _tokens(text: str, min_len: int) -> set[str]:
    words = {w.strip(".'’ʼ-") for w in _WORD.findall(_norm(text))}
    return {w for w in words if len(w) >= min_len}


def _mentions(unit: str, text: str | None, min_len: int = 4) -> bool:
    """True when `unit` shares a content word (>= min_len chars) with `text`.

    Short texts such as "КПІ" have no long words; then any word of 2+ counts.
    """
    if not text:
        return False
    words = _tokens(text, min_len) or _tokens(text, 2)
    return bool(words & _tokens(unit, 2))


def deadline_date(today: date, weekday: int) -> date:
    """The named weekday of the current week; next week's if it is already past.

    "до п'ятниці" said on a Thursday is tomorrow, on a Friday it is today, and
    on a Saturday it is the Friday of next week.
    """
    candidate = today + timedelta(days=weekday - today.weekday())
    return candidate if candidate >= today else candidate + timedelta(days=7)


def deadline_in(clause: str) -> int | None:
    lowered = _norm(clause)
    for pattern, weekday in _DEADLINES:
        if pattern.search(lowered):
            return weekday
    return None


def owner_is_anchored(owner: str, item_text: str, pasted: str) -> bool:
    """The owner is named, as written, in a sentence that mentions the item."""
    name = _norm(owner)
    if not name:
        return False
    first = name.split()[0]
    for sentence in _SENTENCE.split(pasted):
        normalized = _norm(sentence)
        if not _mentions(sentence, item_text):
            continue
        # Full name in the sentence, or its first word there and the full name
        # somewhere in the text ("Tom, please ..." with "Tom Becker" elsewhere).
        if name in normalized:
            return True
        if re.search(rf"(?<!\w){re.escape(first)}(?!\w)", normalized) and (
            name in _norm(pasted)
        ):
            return True
    return False


def fix_owners(agenda: dict, pasted: str) -> dict:
    for item in agenda["items"]:
        if item.get("owner") and not owner_is_anchored(
            item["owner"], item["topic"], pasted
        ):
            item["owner"] = None
    for action in agenda["action_items"]:
        if action.get("owner") and not owner_is_anchored(
            action["owner"], action["task"], pasted
        ):
            action["owner"] = None
    return agenda


def fix_deadlines(agenda: dict, pasted: str, today: date) -> dict:
    """Replace an action item's due with the date its clause's deadline names."""
    for clause in _CLAUSE.split(pasted):
        weekday = deadline_in(clause)
        if weekday is None:
            continue
        due = deadline_date(today, weekday).isoformat()
        for action in agenda["action_items"]:
            linked = _mentions(clause, action["task"]) or _mentions(
                clause, action.get("owner"), min_len=3
            )
            if linked and action.get("due") != due:
                action["due"] = due
    return agenda
