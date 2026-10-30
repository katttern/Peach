import { useId, useState, type FormEvent } from "react";

import type { CreateMeeting } from "../api/meetings";
import {
  dateToLocalInput,
  localInputToUtc,
  nextFullHour,
  shiftEnd,
} from "../lib/datetime";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

// Real values, not an empty field: Safari paints an empty datetime-local with
// today's date as grey placeholder text, which looks like a chosen time.
// Computed per mount/reset, never once at module load.
function defaultTimes() {
  const start = nextFullHour();
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startsAt: dateToLocalInput(start), endsAt: dateToLocalInput(end) };
}

export function MeetingForm({
  onSubmit,
}: {
  onSubmit: (meeting: CreateMeeting) => Promise<void>;
}) {
  const id = useId();
  const [title, setTitle] = useState("");
  const [times, setTimes] = useState(defaultTimes);
  const [attendeeCount, setAttendeeCount] = useState(0);

  const endError =
    times.startsAt &&
    times.endsAt &&
    new Date(times.endsAt) <= new Date(times.startsAt)
      ? "Ends must be after Starts."
      : null;

  function changeStart(startsAt: string) {
    setTimes((current) => ({
      startsAt,
      endsAt: shiftEnd(current.startsAt, current.endsAt, startsAt),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (endError) return;
    await onSubmit({
      title,
      starts_at: localInputToUtc(times.startsAt),
      ends_at: localInputToUtc(times.endsAt),
      attendee_count: attendeeCount,
    });
    setTitle("");
    setTimes(defaultTimes());
    setAttendeeCount(0);
  }

  const label = "grid gap-2 text-sm font-semibold";
  return (
    <form
      onSubmit={submit}
      className="grid gap-[18px] rounded-[32px] border-[1.5px] border-line bg-surface p-7 shadow-form"
    >
      <div className={label}>
        <label htmlFor={`${id}-title`}>Title</label>
        <Input
          id={`${id}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={label}>
          <label htmlFor={`${id}-starts`}>Starts</label>
          <Input
            id={`${id}-starts`}
            type="datetime-local"
            value={times.startsAt}
            onChange={(event) => changeStart(event.target.value)}
            required
          />
        </div>
        <div className={label}>
          <label htmlFor={`${id}-ends`}>Ends</label>
          <Input
            id={`${id}-ends`}
            type="datetime-local"
            value={times.endsAt}
            onChange={(event) =>
              setTimes((current) => ({
                ...current,
                endsAt: event.target.value,
              }))
            }
            aria-invalid={endError ? true : undefined}
            aria-describedby={endError ? `${id}-ends-error` : undefined}
            required
          />
          {endError && (
            <span
              id={`${id}-ends-error`}
              role="alert"
              className="font-normal text-danger"
            >
              {endError}
            </span>
          )}
        </div>
      </div>
      <div className={label}>
        <label htmlFor={`${id}-attendees`}>Attendees</label>
        {/* The API requires a number, so the field stays at 0 rather than empty. */}
        <Input
          id={`${id}-attendees`}
          type="number"
          min="0"
          step="1"
          value={attendeeCount}
          onChange={(event) => setAttendeeCount(Number(event.target.value))}
          aria-describedby={`${id}-attendees-hint`}
          required
        />
        <span
          id={`${id}-attendees-hint`}
          className="text-[13px] font-normal text-muted"
        >
          Number of people; leave 0 if you don't know yet.
        </span>
      </div>
      <div className="flex items-center gap-1 justify-self-start">
        <Button type="submit">Add meeting</Button>
        <span
          aria-hidden="true"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-accent-text text-accent-text"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </div>
    </form>
  );
}
