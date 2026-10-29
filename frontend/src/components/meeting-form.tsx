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

  const label = "grid gap-1 text-sm font-medium";
  return (
    <form onSubmit={submit} className="grid gap-3 rounded border p-4">
      <div className={label}>
        <label htmlFor={`${id}-title`}>Title</label>
        <Input
          id={`${id}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
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
              className="font-normal text-red-700"
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
        <span id={`${id}-attendees-hint`} className="font-normal text-gray-600">
          Number of people; leave 0 if you don't know yet.
        </span>
      </div>
      <Button type="submit" className="justify-self-start">
        Add meeting
      </Button>
    </form>
  );
}
