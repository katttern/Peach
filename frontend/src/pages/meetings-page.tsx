import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";

import {
  createMeeting,
  getMeetings,
  type CreateMeeting,
  type Meeting,
} from "../api/meetings";
import { MeetingForm } from "../components/meeting-form";
import { MeetingList } from "../components/meeting-list";
import { Button } from "../components/ui/button";

export function MeetingsPage() {
  const auth = useAuth();
  const token = auth.user?.access_token;

  let body;
  if (auth.isLoading) {
    body = <p className="text-gray-600">Loading…</p>;
  } else if (!auth.isAuthenticated || !token) {
    body = (
      <div className="grid gap-3 rounded border p-4">
        <p>Sign in to see your meetings.</p>
        <Button
          type="button"
          className="justify-self-start"
          onClick={() => void auth.signinRedirect()}
        >
          Sign in
        </Button>
      </div>
    );
  } else {
    // Keyed by user: signing out or switching accounts unmounts it, so no
    // meetings from the previous session stay in memory or on screen.
    body = <UserMeetings key={auth.user?.profile.sub} token={token} />;
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header>
        <h1 className="text-3xl font-bold">Meetings</h1>
      </header>
      {body}
    </main>
  );
}

function UserMeetings({ token }: { token: string }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMeetings(token)
      .then((loaded) => {
        if (!cancelled) setMeetings(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Could not load meetings.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function addMeeting(payload: CreateMeeting) {
    try {
      const meeting = await createMeeting(payload, token);
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
    <>
      <MeetingForm onSubmit={addMeeting} />
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <MeetingList meetings={meetings} />
    </>
  );
}
