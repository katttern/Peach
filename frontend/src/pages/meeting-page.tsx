import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";

import {
  getAgenda,
  putAgenda,
  type Agenda,
  type AgendaFields,
  type AiMeta,
} from "../api/agenda";
import { ApiError } from "../api/client";
import { getMeetings, type Meeting } from "../api/meetings";
import { suggestedPaths, type ParseResponse } from "../api/parser";
import { AgendaForm } from "../components/agenda-form";
import { PasteAgenda } from "../components/paste-agenda";
import { Button } from "../components/ui/button";
import { formatMeetingRange, meetingRangeTitle } from "../lib/time";

type Load =
  | { state: "loading" }
  | { state: "ready"; meeting: Meeting; agenda: Agenda | null }
  | { state: "missing" }
  | { state: "error"; message: string };

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

export function MeetingPage({ meetingId }: { meetingId: string }) {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{
    result: ParseResponse;
    paths: Set<string>;
    nonce: number;
  } | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([getMeetings(token), getAgenda(meetingId, token)])
      .then(([meetings, agenda]) => {
        if (cancelled) return;
        const meeting = meetings.find((m) => m.id === meetingId);
        setLoad(
          meeting ? { state: "ready", meeting, agenda } : { state: "missing" },
        );
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setLoad({ state: "missing" });
        } else {
          setLoad({
            state: "error",
            message: errorMessage(cause, "Could not load the meeting."),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId, token]);

  async function save(fields: AgendaFields, ai?: AiMeta) {
    if (!token || load.state !== "ready") return;
    try {
      const agenda = await putAgenda(meetingId, fields, ai, token);
      setLoad({ ...load, agenda });
      setSuggestion(null);
      setNotice("Agenda saved.");
    } catch (cause) {
      setNotice(
        cause instanceof ApiError && cause.status === 401
          ? "Your session expired. Sign in again to save."
          : errorMessage(cause, "Could not save the agenda."),
      );
    }
  }

  let body;
  if (auth.isLoading) {
    body = <p className="text-gray-600">Loading…</p>;
  } else if (!auth.isAuthenticated) {
    body = (
      <div className="grid gap-3 rounded border p-4">
        <p>Sign in to see and edit this meeting's agenda.</p>
        <Button
          type="button"
          className="justify-self-start"
          onClick={() =>
            void auth.signinRedirect({ state: window.location.pathname })
          }
        >
          Sign in
        </Button>
      </div>
    );
  } else if (load.state === "loading") {
    body = <p className="text-gray-600">Loading…</p>;
  } else if (load.state === "missing") {
    body = <p>This meeting does not exist.</p>;
  } else if (load.state === "error") {
    body = (
      <p role="alert" className="text-red-700">
        {load.message}
      </p>
    );
  } else {
    const saved = load.agenda;
    // A fresh suggestion travels with the save; otherwise keep the stored one.
    const ai: AiMeta | undefined = suggestion
      ? {
          aiSuggestion: suggestion.result.agenda,
          aiModel: suggestion.result.model,
          aiPromptVersion: suggestion.result.prompt_version,
        }
      : saved?.ai_suggestion
        ? {
            aiSuggestion: saved.ai_suggestion,
            aiModel: saved.ai_model ?? undefined,
            aiPromptVersion: saved.ai_prompt_version ?? undefined,
          }
        : undefined;
    body = (
      <>
        <header className="space-y-1">
          <h1 className="text-3xl font-bold">{load.meeting.title}</h1>
          <p
            className="text-gray-600"
            title={meetingRangeTitle(
              load.meeting.starts_at,
              load.meeting.ends_at,
            )}
          >
            {formatMeetingRange(load.meeting.starts_at, load.meeting.ends_at)}
          </p>
        </header>
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {token && (
          <PasteAgenda
            token={token}
            onParsed={(result) => {
              setNotice(null);
              setSuggestion((current) => ({
                result,
                paths: suggestedPaths(result.agenda),
                nonce: (current?.nonce ?? 0) + 1,
              }));
            }}
          />
        )}
        <AgendaForm
          key={
            suggestion
              ? `suggestion-${suggestion.nonce}`
              : (saved?.updated_at ?? "new")
          }
          initialValues={suggestion ? suggestion.result.agenda : saved}
          suggestedFields={suggestion?.paths}
          ai={ai}
          onSave={save}
        />
      </>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <a href="/" className="text-sm underline">
        ← All meetings
      </a>
      {body}
    </main>
  );
}
