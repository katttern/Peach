import { useEffect, useState } from "react";

import {
  createMeeting,
  getMeetings,
  type CreateMeeting,
  type Meeting,
} from "../api/meetings";
import { MeetingForm } from "../components/meeting-form";
import { MeetingList } from "../components/meeting-list";

export function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMeetings()
      .then(setMeetings)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : "Could not load meetings.",
        ),
      );
  }, []);

  async function addMeeting(payload: CreateMeeting) {
    try {
      const meeting = await createMeeting(payload);
      setMeetings((current) => [...current, meeting]);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create the meeting.",
      );
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header>
        <h1 className="text-3xl font-bold">Meetings</h1>
      </header>
      <MeetingForm onSubmit={addMeeting} />
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <MeetingList meetings={meetings} />
    </main>
  );
}
