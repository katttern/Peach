import { apiFetch } from "./client";

export type Meeting = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  attendee_count: number;
};

export type CreateMeeting = Omit<Meeting, "id">;

export function getMeetings(token: string): Promise<Meeting[]> {
  return apiFetch<Meeting[]>("/api/meetings", {}, token);
}

export function createMeeting(
  payload: CreateMeeting,
  token: string,
): Promise<Meeting> {
  return apiFetch<Meeting>(
    "/api/meetings",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );
}
