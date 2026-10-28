import { afterEach, describe, expect, it, vi } from "vitest";

import { formatMeetingRange, meetingRangeTitle } from "./time";

function withLanguage(language: string) {
  vi.stubGlobal("navigator", { language });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("formatMeetingRange", () => {
  it("shows one date and a time range for the same day", () => {
    withLanguage("uk-UA");
    // 20:54Z is 22:54 in Kyiv (UTC+2 after 25.10.2026).
    expect(
      formatMeetingRange("2026-10-29T20:54:00Z", "2026-10-29T21:54:00Z"),
    ).toBe("чт, 29 жовт. 2026, 22:54–23:54");
  });

  it("shows two full dates when the meeting crosses midnight", () => {
    withLanguage("uk-UA");
    expect(
      formatMeetingRange("2026-10-29T20:54:00Z", "2026-10-30T08:00:00Z"),
    ).toBe("чт, 29 жовт. 2026, 22:54 – пт, 30 жовт. 2026, 10:00");
  });

  it("uses wall-clock times across the DST change on 25.10.2026", () => {
    withLanguage("uk-UA");
    // 00:30Z = 03:30 EEST (UTC+3); 02:30Z = 04:30 EET (UTC+2): 2 h elapse.
    expect(
      formatMeetingRange("2026-10-25T00:30:00Z", "2026-10-25T02:30:00Z"),
    ).toBe("нд, 25 жовт. 2026, 03:30–04:30");
  });

  it("follows navigator.language", () => {
    withLanguage("en-GB");
    expect(
      formatMeetingRange("2026-10-29T20:54:00Z", "2026-10-29T21:54:00Z"),
    ).toBe("Thu, 29 Oct 2026, 22:54–23:54");
  });

  it.each(["en_US", "", "not a locale!"])(
    "falls back to uk-UA for an unusable language %j",
    (language) => {
      withLanguage(language);
      expect(
        formatMeetingRange("2026-10-29T20:54:00Z", "2026-10-29T21:54:00Z"),
      ).toBe("чт, 29 жовт. 2026, 22:54–23:54");
    },
  );
});

describe("meetingRangeTitle", () => {
  it("is the raw UTC range", () => {
    expect(
      meetingRangeTitle("2026-10-29T22:54:00+02:00", "2026-10-29T21:54:00Z"),
    ).toBe("2026-10-29T20:54:00Z – 2026-10-29T21:54:00Z (UTC)");
  });
});
