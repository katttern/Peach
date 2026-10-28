import type { ActionItem, AgendaItem } from "./agenda";
import { ApiError } from "./client";

const PARSER_URL = import.meta.env.VITE_AGENDA_PARSER_URL as string | undefined;

export const MAX_PASTE_CHARS = 10_000;

/** Agenda as the model suggests it; starts_at is ISO 8601 with an offset. */
export type SuggestedAgenda = {
  title: string | null;
  starts_at: string | null;
  duration_minutes: number | null;
  items: AgendaItem[];
  action_items: ActionItem[];
  language: string;
};

export type ParseResponse = {
  agenda: SuggestedAgenda;
  model: string;
  prompt_version: string;
};

export const parserConfigured = Boolean(PARSER_URL);

/** Counts code points, like len() in the Python handler. */
export const countChars = (text: string) => [...text].length;

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Throws ApiError (status 0 for network failures) or a DOMException on abort. */
export async function parseAgenda(
  text: string,
  token: string,
  signal: AbortSignal,
): Promise<ParseResponse> {
  if (!PARSER_URL) throw new ApiError("Parser is not configured.", 0);
  let response: Response;
  try {
    response = await fetch(PARSER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text,
        today: localToday(),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError("Network error.", 0);
  }
  if (!response.ok) throw new ApiError("Parse failed.", response.status);
  return response.json() as Promise<ParseResponse>;
}

/** Paths of every non-empty field, e.g. "title", "items.0.owner". */
export function suggestedPaths(agenda: SuggestedAgenda): Set<string> {
  const paths = new Set<string>();
  const filled = (value: unknown) =>
    value !== null && value !== undefined && String(value).trim() !== "";
  if (filled(agenda.title)) paths.add("title");
  if (filled(agenda.starts_at)) paths.add("starts_at");
  if (filled(agenda.duration_minutes)) paths.add("duration_minutes");
  agenda.items.forEach((item, i) => {
    for (const key of ["topic", "owner", "minutes"] as const) {
      if (filled(item[key])) paths.add(`items.${i}.${key}`);
    }
  });
  agenda.action_items.forEach((action, i) => {
    for (const key of ["task", "owner", "due"] as const) {
      if (filled(action[key])) paths.add(`action_items.${i}.${key}`);
    }
  });
  return paths;
}
