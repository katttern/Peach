import { useState, type ReactNode } from "react";
import { useAuth } from "react-oidc-context";

import {
  getAgenda,
  putAgenda,
  type AgendaFields,
  type AiMeta,
} from "../api/agenda";
import { ApiError } from "../api/client";
import { suggestedPaths, type ParseResponse } from "../api/parser";
import { AgendaForm } from "../components/agenda-form";
import { AppShell } from "../components/app-shell";
import { BackLink, MeetingHeader } from "../components/meeting-header";
import { PasteAgenda } from "../components/paste-agenda";
import { SignInCard } from "../components/sign-in-card";
import { errorMessage, useMeeting, type Load } from "./use-meeting";

/**
 * Everything except the ready state of a meeting page: loading, signed out,
 * missing, error. Returns null when the page can render its own content.
 */
function meetingPageFallback(
  auth: ReturnType<typeof useAuth>,
  load: Load<unknown>,
  signInText: string,
): ReactNode {
  let body: ReactNode;
  if (auth.isLoading || (auth.isAuthenticated && load.state === "loading")) {
    body = <p className="text-muted">Loading…</p>;
  } else if (!auth.isAuthenticated) {
    body = (
      <SignInCard
        text={signInText}
        onSignIn={() =>
          void auth.signinRedirect({ state: window.location.pathname })
        }
      />
    );
  } else if (load.state === "missing") {
    body = <p>This meeting does not exist.</p>;
  } else if (load.state === "error") {
    body = (
      <p role="alert" className="font-semibold text-danger">
        {load.message}
      </p>
    );
  } else {
    return null;
  }
  return (
    <AppShell
      ghost="agenda"
      header={
        <>
          <BackLink />
          {body}
        </>
      }
    />
  );
}

export function MeetingPage({ meetingId }: { meetingId: string }) {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const [load, setLoad] = useMeeting(meetingId, token, getAgenda);
  const [notice, setNotice] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{
    result: ParseResponse;
    paths: Set<string>;
    nonce: number;
  } | null>(null);

  async function save(fields: AgendaFields, ai?: AiMeta) {
    if (!token || load.state !== "ready") return;
    try {
      const agenda = await putAgenda(meetingId, fields, ai, token);
      setLoad({ ...load, data: agenda });
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

  const fallback = meetingPageFallback(
    auth,
    load,
    "Sign in to see and edit this meeting's agenda.",
  );
  if (fallback || load.state !== "ready") return fallback;

  const saved = load.data;
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

  return (
    <AppShell
      ghost="agenda"
      header={
        <>
          <BackLink />
          <MeetingHeader meeting={load.meeting} />
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {notice && (
          <p
            role="status"
            className="m-0 rounded-[28px] bg-surface px-6 py-4 text-sm font-semibold shadow-card"
          >
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
      </div>
    </AppShell>
  );
}
