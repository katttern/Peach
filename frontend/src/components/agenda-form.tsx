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
    <label className="grid gap-1 text-sm">
      <span className="flex items-center gap-2 font-medium">
        {label}
        {suggested.has(path) && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">
            suggested
          </span>
        )}
      </span>
      {children}
      {error && <span className="text-red-700">{error}</span>}
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
      className="grid gap-4 rounded border p-4"
      aria-label="Agenda"
    >
      <h2 className="text-xl font-semibold">Add agenda</h2>

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
              className="text-xs text-gray-600"
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

      <fieldset className="grid gap-3">
        <legend className="mb-2 font-semibold">Topics</legend>
        {draft.items.map((item, i) => (
          <div
            key={i}
            className="grid gap-2 rounded border p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
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
              className="text-sm underline disabled:opacity-40"
              onClick={() => removeItem(i)}
              disabled={draft.items.length === 1}
            >
              Remove
            </button>
          </div>
        ))}
        {errors.items && <p className="text-sm text-red-700">{errors.items}</p>}
        <button
          type="button"
          className="justify-self-start text-sm underline"
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

      <fieldset className="grid gap-3">
        <legend className="mb-2 font-semibold">Action items</legend>
        {draft.actionItems.length === 0 && (
          <p className="text-sm text-gray-600">No action items.</p>
        )}
        {draft.actionItems.map((action, i) => (
          <div
            key={i}
            className="grid gap-2 rounded border p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
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
              className="text-sm underline"
              onClick={() => removeAction(i)}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="justify-self-start text-sm underline"
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

      <Button type="submit" disabled={saving} className="justify-self-start">
        {saving ? "Saving…" : "Save agenda"}
      </Button>
    </form>
  );
}
