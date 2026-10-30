import type { Meeting } from "../api/meetings";
import { formatMeetingRange, meetingRangeTitle } from "../lib/time";
import { meetingHref } from "./meeting-header";
import { ArrowBadge } from "./ui/button";

export function MeetingList({ meetings }: { meetings: Meeting[] }) {
  if (meetings.length === 0) {
    return (
      <p className="rounded-[28px] bg-surface px-6 py-5 shadow-card">
        No meetings yet.
      </p>
    );
  }

  return (
    <ul
      className="m-0 flex list-none flex-col gap-3.5 p-0"
      aria-label="Meetings"
    >
      {meetings.map((meeting) => (
        <li key={meeting.id}>
          {/* The whole card is the link to the meeting's agenda page. */}
          <a
            href={meetingHref(meeting.id)}
            className="group flex flex-wrap items-center justify-between gap-4 rounded-[28px] bg-surface px-6 py-[22px] text-text no-underline shadow-card transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 className="m-0 break-words font-display text-lg font-medium">
                {meeting.title}
              </h2>
              <span
                className="text-[15px]"
                title={meetingRangeTitle(meeting.starts_at, meeting.ends_at)}
              >
                {formatMeetingRange(meeting.starts_at, meeting.ends_at)}
              </span>
              <span className="self-start rounded-full bg-tint px-2.5 py-1 text-xs font-semibold text-tint-text">
                {meeting.attendee_count} attendees
              </span>
            </div>
            <span
              aria-hidden="true"
              className="inline-flex h-11 shrink-0 items-center gap-2.5 rounded-full border-[1.5px] border-accent-text pl-[18px] pr-1.5 font-display text-xs font-medium text-accent-text"
            >
              Open agenda
              <ArrowBadge />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
