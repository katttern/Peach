import { ApiError, apiFetch } from "./client";

export type AgendaItem = {
  topic: string;
  owner: string | null;
  minutes: number | null;
};

export type ActionItem = {
  task: string;
  owner: string | null;
  due: string | null;
};

export type AgendaFields = {
  title: string | null;
  starts_at: string | null;
  duration_minutes: number | null;
  items: AgendaItem[];
  action_items: ActionItem[];
};

export type AiMeta = {
  aiSuggestion?: Record<string, unknown>;
  aiModel?: string;
  aiPromptVersion?: string;
};

export type Agenda = AgendaFields & {
  id: string;
  meeting_id: string;
  ai_suggestion: Record<string, unknown> | null;
  ai_model: string | null;
  ai_prompt_version: string | null;
  updated_at: string;
};

const path = (meetingId: string) =>
  `/api/meetings/${encodeURIComponent(meetingId)}/agenda`;

/** Returns null when the meeting has no agenda yet. */
export async function getAgenda(
  meetingId: string,
  token: string,
): Promise<Agenda | null> {
  try {
    return await apiFetch<Agenda>(path(meetingId), {}, token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function putAgenda(
  meetingId: string,
  agenda: AgendaFields,
  ai: AiMeta | undefined,
  token: string,
): Promise<Agenda> {
  return apiFetch<Agenda>(
    path(meetingId),
    {
      method: "PUT",
      body: JSON.stringify({
        ...agenda,
        ai_suggestion: ai?.aiSuggestion ?? null,
        ai_model: ai?.aiModel ?? null,
        ai_prompt_version: ai?.aiPromptVersion ?? null,
      }),
    },
    token,
  );
}
