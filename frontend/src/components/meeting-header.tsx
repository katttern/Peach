import type { Meeting } from "../api/meetings";
import { formatMeetingRange, meetingRangeTitle } from "../lib/time";
import { ArrowBadge } from "./ui/button";

export const meetingHref = (id: string) => `/meetings/${id}`;

export function BackLink() {
  return (
    <a
      href="/"
      className="inline-flex h-11 items-center gap-2.5 self-start rounded-full border-[1.5px] border-accent-text bg-surface pl-1.5 pr-[18px] font-display text-xs font-medium text-accent-text no-underline hover:opacity-85"
    >
      <ArrowBadge back />
      All meetings
    </a>
  );
}

/** Title and time range of one meeting. */
export function MeetingHeader({ meeting }: { meeting: Meeting }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h1 className="m-0 break-words font-display text-[34px] font-bold tracking-[-0.02em]">
        {meeting.title}
      </h1>
      <span
        className="text-sm text-muted"
        title={meetingRangeTitle(meeting.starts_at, meeting.ends_at)}
      >
        {formatMeetingRange(meeting.starts_at, meeting.ends_at)}
      </span>
    </div>
  );
}
