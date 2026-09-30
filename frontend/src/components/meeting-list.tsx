import type { Meeting } from "../api/meetings";

export function MeetingList({ meetings }: { meetings: Meeting[] }) {
  if (meetings.length === 0) return <p>No meetings yet.</p>;

  return (
    <ul className="space-y-3" aria-label="Meetings">
      {meetings.map((meeting) => (
        <li key={meeting.id} className="rounded border p-4">
          <h2 className="font-semibold">{meeting.title}</h2>
          <p>{meeting.starts_at} — {meeting.ends_at}</p>
          <p>{meeting.attendee_count} attendees</p>
        </li>
      ))}
    </ul>
  );
}
