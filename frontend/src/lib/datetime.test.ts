import { describe, expect, it } from "vitest";

import {
  dateToLocalInput,
  localInputToUtc,
  nextFullHour,
  shiftEnd,
  utcToLocalInput,
} from "./datetime";

// Tests run with TZ=Europe/Kyiv (vitest.config.ts).

describe("nextFullHour", () => {
  it.each([
    ["2026-10-28T12:05:00", "2026-10-28T13:00"],
    ["2026-10-28T12:00:00", "2026-10-28T13:00"],
    ["2026-10-28T12:59:59", "2026-10-28T13:00"],
    ["2026-10-28T23:30:00", "2026-10-29T00:00"],
  ])("after %s is %s", (now, expected) => {
    expect(dateToLocalInput(nextFullHour(new Date(now)))).toBe(expected);
  });

  it("does not mutate its argument", () => {
    const now = new Date("2026-10-28T12:05:00");
    nextFullHour(now);
    expect(dateToLocalInput(now)).toBe("2026-10-28T12:05");
  });
});

describe("dateToLocalInput", () => {
  it("formats local wall-clock time for datetime-local", () => {
    expect(dateToLocalInput(new Date("2026-10-29T20:54:00Z"))).toBe(
      "2026-10-29T22:54",
    );
  });

  it("pads single digits", () => {
    expect(dateToLocalInput(new Date(2026, 0, 5, 7, 3))).toBe(
      "2026-01-05T07:03",
    );
  });
});

describe("API conversion (unchanged)", () => {
  it("sends 22:54 Kyiv on 29.10.2026 (UTC+2) as 20:54Z", () => {
    expect(localInputToUtc("2026-10-29T22:54")).toBe("2026-10-29T20:54:00Z");
  });

  it("round-trips through utcToLocalInput", () => {
    expect(utcToLocalInput("2026-10-29T20:54:00Z")).toBe("2026-10-29T22:54");
  });
});

describe("shiftEnd", () => {
  it("keeps the end while it is still after the new start", () => {
    expect(
      shiftEnd("2026-10-29T10:00", "2026-10-29T12:00", "2026-10-29T11:00"),
    ).toBe("2026-10-29T12:00");
  });

  it("moves the end to keep the previous duration", () => {
    expect(
      shiftEnd("2026-10-29T10:00", "2026-10-29T11:30", "2026-10-29T12:00"),
    ).toBe("2026-10-29T13:30");
  });

  it("moves the end when it would equal the new start", () => {
    expect(
      shiftEnd("2026-10-29T10:00", "2026-10-29T11:00", "2026-10-29T11:00"),
    ).toBe("2026-10-29T12:00");
  });

  it("falls back to one hour when the previous duration was not positive", () => {
    expect(
      shiftEnd("2026-10-29T12:00", "2026-10-29T11:00", "2026-10-29T14:00"),
    ).toBe("2026-10-29T15:00");
    expect(shiftEnd("", "", "2026-10-29T14:00")).toBe("2026-10-29T15:00");
  });

  it("leaves the end alone while the start is being cleared", () => {
    expect(shiftEnd("2026-10-29T10:00", "2026-10-29T11:00", "")).toBe(
      "2026-10-29T11:00",
    );
  });
});
