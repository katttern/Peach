import type { Meeting } from "../api/meetings";
import { formatMeetingRange, meetingRangeTitle } from "../lib/time";

export function MeetingList({ meetings }: { meetings: Meeting[] }) {
  if (meetings.length === 0) return <p>No meetings yet.</p>;

  return (
    <ul className="space-y-3" aria-label="Meetings">
      {meetings.map((meeting) => (
        <li key={meeting.id}>
          {/* The whole card is the link to the meeting's agenda page. */}
          <a
            href={`/meetings/${meeting.id}`}
            className="group flex items-center justify-between gap-4 rounded border p-4 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            <div className="space-y-1">
              <h2 className="font-semibold">{meeting.title}</h2>
              <p title={meetingRangeTitle(meeting.starts_at, meeting.ends_at)}>
                {formatMeetingRange(meeting.starts_at, meeting.ends_at)}
              </p>
              <p className="text-sm text-gray-600">
                {meeting.attendee_count} attendees
              </p>
            </div>
            <span
              aria-hidden="true"
              className="shrink-0 rounded border px-3 py-1 text-sm font-medium group-hover:border-slate-900 group-hover:bg-white"
            >
              Open agenda →
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
