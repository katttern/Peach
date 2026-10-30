import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";

import {
  createMeeting,
  getMeetings,
  type CreateMeeting,
  type Meeting,
} from "../api/meetings";
import { AppShell } from "../components/app-shell";
import { MeetingForm } from "../components/meeting-form";
import { MeetingList } from "../components/meeting-list";
import { SignInCard } from "../components/sign-in-card";

const title = (
  <h1 className="m-0 font-display text-[40px] font-bold tracking-[-0.02em]">
    Meetings
  </h1>
);

export function MeetingsPage() {
  const auth = useAuth();
  const token = auth.user?.access_token;

  if (auth.isLoading) {
    return (
      <AppShell
        ghost="meetings"
        header={
          <>
            {title}
            <p className="text-muted">Loading…</p>
          </>
        }
      />
    );
  }
  if (!auth.isAuthenticated || !token) {
    return (
      <AppShell
        ghost="meetings"
        header={
          <>
            {title}
            <SignInCard
              text="Sign in to see your meetings."
              onSignIn={() => void auth.signinRedirect()}
            />
          </>
        }
      />
    );
  }
  // Keyed by user: signing out or switching accounts unmounts it, so no
  // meetings from the previous session stay in memory or on screen.
  return <UserMeetings key={auth.user?.profile.sub} token={token} />;
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
    <AppShell
      ghost="meetings"
      overlap
      header={
        <>
          {title}
          <MeetingForm onSubmit={addMeeting} />
        </>
      }
    >
      {error && (
        <p
          role="alert"
          className="mb-3.5 rounded-[28px] bg-surface px-6 py-4 font-semibold text-danger shadow-card"
        >
          {error}
        </p>
      )}
      <MeetingList meetings={meetings} />
    </AppShell>
  );
}
