const FALLBACK_LOCALE = "uk-UA";

function userLocale(): string {
  const preferred = typeof navigator !== "undefined" ? navigator.language : "";
  try {
    if (preferred && Intl.DateTimeFormat.supportedLocalesOf(preferred).length) {
      return preferred;
    }
  } catch {
    // Malformed tag (e.g. "en_US") throws RangeError; use the fallback.
  }
  return FALLBACK_LOCALE;
}

const OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

/**
 * Meeting time in the viewer's time zone and language. Same day:
 * "чт, 29 жовт. 2026, 22:54–23:54"; otherwise two full dates.
 */
export function formatMeetingRange(startIso: string, endIso: string): string {
  const locale = userLocale();
  const text = new Intl.DateTimeFormat(locale, OPTIONS).formatRange(
    new Date(startIso),
    new Date(endIso),
  );
  // Ukrainian adds "р." (рік) after the year; the app's format leaves it out.
  return locale.startsWith("uk") ? text.replace(/(\d{4}) р\./g, "$1") : text;
}

/** Raw UTC ISO range for a title tooltip, handy when debugging time zones. */
export function meetingRangeTitle(startIso: string, endIso: string): string {
  const utc = (iso: string) =>
    new Date(iso).toISOString().replace(".000Z", "Z");
  return `${utc(startIso)} – ${utc(endIso)} (UTC)`;
}
