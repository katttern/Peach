import { useState, type FormEvent, type ReactNode } from "react";

import type { AgendaFields, AiMeta } from "../api/agenda";
import { localInputToUtc, utcToLocalInput } from "../lib/datetime";
import { formatMeetingRange, meetingRangeTitle } from "../lib/time";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type ItemDraft = { topic: string; owner: string; minutes: string };
type ActionDraft = { task: string; owner: string; due: string };
type Draft = {
  title: string;
  startsAt: string;
  durationMinutes: string;
  items: ItemDraft[];
  actionItems: ActionDraft[];
};
type Errors = Record<string, string>;

const emptyItem: ItemDraft = { topic: "", owner: "", minutes: "" };
const emptyAction: ActionDraft = { task: "", owner: "", due: "" };

function toDraft(values?: Partial<AgendaFields> | null): Draft {
  const items = (values?.items ?? []).map((item) => ({
    topic: item.topic ?? "",
    owner: item.owner ?? "",
    minutes: item.minutes == null ? "" : String(item.minutes),
  }));
  return {
    title: values?.title ?? "",
    startsAt: values?.starts_at ? utcToLocalInput(values.starts_at) : "",
    durationMinutes:
      values?.duration_minutes == null ? "" : String(values.duration_minutes),
    items: items.length > 0 ? items : [{ ...emptyItem }],
    actionItems: (values?.action_items ?? []).map((action) => ({
      task: action.task ?? "",
      owner: action.owner ?? "",
      due: action.due ?? "",
    })),
  };
}

const blankToNull = (value: string) =>
  value.trim() === "" ? null : value.trim();

function intInRange(value: string, min: number, max: number): boolean {
  return /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
}

// Mirrors AgendaIn on the server: at least one item, every item needs a topic,
// every action item needs a task, durations are whole minutes.
function validate(draft: Draft): Errors {
  const errors: Errors = {};
  if (draft.durationMinutes && !intInRange(draft.durationMinutes, 1, 600)) {
    errors.duration_minutes = "Whole minutes from 1 to 600.";
  }
  if (draft.items.length === 0) errors.items = "Add at least one topic.";
  draft.items.forEach((item, i) => {
    if (!item.topic.trim()) errors[`items.${i}.topic`] = "Topic is required.";
    if (item.minutes && !intInRange(item.minutes, 1, 480)) {
      errors[`items.${i}.minutes`] = "Whole minutes from 1 to 480.";
    }
  });
  draft.actionItems.forEach((action, i) => {
    if (!action.task.trim()) {
      errors[`action_items.${i}.task`] = "Task is required.";
    }
  });
  return errors;
}

function toFields(draft: Draft): AgendaFields {
  return {
    title: blankToNull(draft.title),
    starts_at: draft.startsAt ? localInputToUtc(draft.startsAt) : null,
    duration_minutes: draft.durationMinutes
      ? Number(draft.durationMinutes)
      : null,
    items: draft.items.map((item) => ({
      topic: item.topic.trim(),
      owner: blankToNull(item.owner),
      minutes: item.minutes ? Number(item.minutes) : null,
    })),
    action_items: draft.actionItems.map((action) => ({
      task: action.task.trim(),
      owner: blankToNull(action.owner),
      due: action.due || null,
    })),
  };
}

/** Drops "<list>.<index>.*" paths and shifts later indices down by one. */
function withoutRow(paths: Set<string>, list: string, index: number) {
  const next = new Set<string>();
  for (const path of paths) {
    const [head, rawIndex, ...rest] = path.split(".");
    const i = Number(rawIndex);
    if (head !== list || Number.isNaN(i)) next.add(path);
    else if (i > index) next.add([head, i - 1, ...rest].join("."));
    else if (i < index) next.add(path);
  }
  return next;
}

function Field({
  label,
  path,
  suggested,
  error,
  children,
}: {
  label: string;
  path: string;
  suggested: Set<string>;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-[13px]">
      <span className="flex items-center gap-2 font-semibold">
        {label}
        {suggested.has(path) && (
          <span className="rounded-full bg-tint px-2 py-0.5 text-[11px] font-semibold text-tint-text">
            suggested
          </span>
        )}
      </span>
      {children}
      {error && <span className="text-danger">{error}</span>}
    </label>
  );
}

export function AgendaForm({
  initialValues,
  suggestedFields,
  ai,
  onSave,
}: {
  initialValues?: Partial<AgendaFields> | null;
  suggestedFields?: Set<string>;
  ai?: AiMeta;
  onSave: (agenda: AgendaFields, ai?: AiMeta) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialValues));
  const [suggested, setSuggested] = useState<Set<string>>(
    () => new Set(suggestedFields),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  function touch(path: string) {
    setSuggested((current) => {
      if (!current.has(path)) return current;
      const next = new Set(current);
      next.delete(path);
      return next;
    });
  }

  function setTop(key: "title" | "startsAt" | "durationMinutes", path: string) {
    return (value: string) => {
      setDraft((current) => ({ ...current, [key]: value }));
      touch(path);
    };
  }

  function setItem(i: number, key: keyof ItemDraft) {
    return (value: string) => {
      setDraft((current) => ({
        ...current,
        items: current.items.map((item, j) =>
          j === i ? { ...item, [key]: value } : item,
        ),
      }));
      touch(`items.${i}.${key}`);
    };
  }

  function setAction(i: number, key: keyof ActionDraft) {
    return (value: string) => {
      setDraft((current) => ({
        ...current,
        actionItems: current.actionItems.map((action, j) =>
          j === i ? { ...action, [key]: value } : action,
        ),
      }));
      touch(`action_items.${i}.${key}`);
    };
  }

  function removeItem(i: number) {
    setDraft((current) => ({
      ...current,
      items: current.items.filter((_, j) => j !== i),
    }));
    setSuggested((current) => withoutRow(current, "items", i));
    setErrors({});
  }

  function removeAction(i: number) {
    setDraft((current) => ({
      ...current,
      actionItems: current.actionItems.filter((_, j) => j !== i),
    }));
    setSuggested((current) => withoutRow(current, "action_items", i));
    setErrors({});
  }

  // Readable preview of the chosen start (+ duration) in the viewer's locale.
  const agendaRange = (() => {
    if (!draft.startsAt) return null;
    const start = new Date(draft.startsAt);
    if (Number.isNaN(start.getTime())) return null;
    const minutes = intInRange(draft.durationMinutes, 1, 600)
      ? Number(draft.durationMinutes)
      : 0;
    const end = new Date(start.getTime() + minutes * 60_000);
    return { start: start.toISOString(), end: end.toISOString() };
  })();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await onSave(toFields(draft), ai);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-[18px] rounded-[32px] bg-surface p-[26px] shadow-panel"
      aria-label="Agenda"
    >
      <h2 className="m-0 font-display text-base font-medium">Add agenda</h2>

      <Field label="Title" path="title" suggested={suggested}>
        <Input
          value={draft.title}
          onChange={(e) => setTop("title", "title")(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts at" path="starts_at" suggested={suggested}>
          <Input
            type="datetime-local"
            value={draft.startsAt}
            onChange={(e) => setTop("startsAt", "starts_at")(e.target.value)}
          />
          {agendaRange && (
            <span
              className="text-[13px] font-normal text-muted"
              title={meetingRangeTitle(agendaRange.start, agendaRange.end)}
            >
              {formatMeetingRange(agendaRange.start, agendaRange.end)}
            </span>
          )}
        </Field>
        <Field
          label="Duration (minutes)"
          path="duration_minutes"
          suggested={suggested}
          error={errors.duration_minutes}
        >
          <Input
            type="number"
            min="1"
            max="600"
            step="1"
            value={draft.durationMinutes}
            onChange={(e) =>
              setTop("durationMinutes", "duration_minutes")(e.target.value)
            }
          />
        </Field>
      </div>

      <fieldset className="m-0 grid gap-3 border-0 p-0">
        <legend className="mb-3 font-display text-[13px] font-medium">
          Topics
        </legend>
        {draft.items.map((item, i) => (
          <div
            key={i}
            className="grid gap-2.5 rounded-[22px] bg-row p-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_96px_auto] sm:items-end"
          >
            <Field
              label="Topic *"
              path={`items.${i}.topic`}
              suggested={suggested}
              error={errors[`items.${i}.topic`]}
            >
              <Input
                value={item.topic}
                onChange={(e) => setItem(i, "topic")(e.target.value)}
              />
            </Field>
            <Field
              label="Owner"
              path={`items.${i}.owner`}
              suggested={suggested}
            >
              <Input
                value={item.owner}
                onChange={(e) => setItem(i, "owner")(e.target.value)}
              />
            </Field>
            <Field
              label="Minutes"
              path={`items.${i}.minutes`}
              suggested={suggested}
              error={errors[`items.${i}.minutes`]}
            >
              <Input
                type="number"
                min="1"
                max="480"
                step="1"
                value={item.minutes}
                onChange={(e) => setItem(i, "minutes")(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className="h-11 px-1.5 text-[13px] font-semibold text-accent-text underline disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => removeItem(i)}
              disabled={draft.items.length === 1}
            >
              Remove
            </button>
          </div>
        ))}
        {errors.items && <p className="text-sm text-danger">{errors.items}</p>}
        <button
          type="button"
          className="justify-self-start text-sm font-semibold text-accent-text"
          onClick={() =>
            setDraft((current) => ({
              ...current,
              items: [...current.items, { ...emptyItem }],
            }))
          }
        >
          + Add topic
        </button>
      </fieldset>

      <fieldset className="m-0 grid gap-3 border-0 p-0">
        <legend className="mb-3 font-display text-[13px] font-medium">
          Action items
        </legend>
        {draft.actionItems.length === 0 && (
          <p className="m-0 text-sm text-muted">No action items.</p>
        )}
        {draft.actionItems.map((action, i) => (
          <div
            key={i}
            className="grid gap-2.5 rounded-[22px] bg-row p-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_150px_auto] sm:items-end"
          >
            <Field
              label="Task *"
              path={`action_items.${i}.task`}
              suggested={suggested}
              error={errors[`action_items.${i}.task`]}
            >
              <Input
                value={action.task}
                onChange={(e) => setAction(i, "task")(e.target.value)}
              />
            </Field>
            <Field
              label="Owner"
              path={`action_items.${i}.owner`}
              suggested={suggested}
            >
              <Input
                value={action.owner}
                onChange={(e) => setAction(i, "owner")(e.target.value)}
              />
            </Field>
            <Field
              label="Due date"
              path={`action_items.${i}.due`}
              suggested={suggested}
            >
              <Input
                type="date"
                value={action.due}
                onChange={(e) => setAction(i, "due")(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className="h-11 px-1.5 text-[13px] font-semibold text-accent-text underline"
              onClick={() => removeAction(i)}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="justify-self-start text-sm font-semibold text-accent-text"
          onClick={() =>
            setDraft((current) => ({
              ...current,
              actionItems: [...current.actionItems, { ...emptyAction }],
            }))
          }
        >
          + Add action item
        </button>
      </fieldset>

      <div className="mt-1 flex items-center gap-1">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save agenda"}
        </Button>
        <span
          aria-hidden="true"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-accent-text text-accent-text"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M3 9h12M10.5 4.5 15 9l-4.5 4.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </form>
  );
}
