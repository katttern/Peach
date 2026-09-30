import { useState, type FormEvent } from "react";

import type { CreateMeeting } from "../api/meetings";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function MeetingForm({ onSubmit }: { onSubmit: (meeting: CreateMeeting) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [attendeeCount, setAttendeeCount] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({ title, starts_at: new Date(startsAt).toISOString().replace(".000Z", "Z"), ends_at: new Date(endsAt).toISOString().replace(".000Z", "Z"), attendee_count: attendeeCount });
    setTitle(""); setStartsAt(""); setEndsAt(""); setAttendeeCount(0);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded border p-4">
      <Input aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" required />
      <Input aria-label="Start time" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
      <Input aria-label="End time" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
      <Input aria-label="Attendee count" type="number" min="0" value={attendeeCount} onChange={(event) => setAttendeeCount(Number(event.target.value))} required />
      <Button type="submit">Add meeting</Button>
    </form>
  );
}
