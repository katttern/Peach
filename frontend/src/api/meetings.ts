export type Meeting = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  attendee_count: number;
};

export type CreateMeeting = Omit<Meeting, "id">;

const API_URL = `${import.meta.env.VITE_API_URL ?? ""}/api/meetings`;

export async function getMeetings(): Promise<Meeting[]> {
  const response = await fetch(API_URL);
  if (!response.ok) throw new Error("Could not load meetings.");
  return response.json() as Promise<Meeting[]>;
}

export async function createMeeting(payload: CreateMeeting): Promise<Meeting> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Could not create the meeting.");
  return response.json() as Promise<Meeting>;
}
