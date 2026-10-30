import { useEffect, useState } from "react";

import { ApiError } from "../api/client";
import { getMeetings, type Meeting } from "../api/meetings";

export type Load<T> =
  | { state: "loading" }
  | { state: "ready"; meeting: Meeting; data: T }
  | { state: "missing" }
  | { state: "error"; message: string };

export const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

/**
 * Loads the meeting (from the user's list; there is no GET by id) together
 * with page data such as its agenda. A 404 means "not yours or gone".
 */
export function useMeeting<T>(
  meetingId: string,
  token: string | undefined,
  loadData: (meetingId: string, token: string) => Promise<T>,
) {
  const [load, setLoad] = useState<Load<T>>({ state: "loading" });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([getMeetings(token), loadData(meetingId, token)])
      .then(([meetings, data]) => {
        if (cancelled) return;
        const meeting = meetings.find((m) => m.id === meetingId);
        setLoad(
          meeting ? { state: "ready", meeting, data } : { state: "missing" },
        );
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setLoad({ state: "missing" });
        } else {
          setLoad({
            state: "error",
            message: errorMessage(cause, "Could not load the meeting."),
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // loadData is a module-level function; it never changes between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, token]);

  return [load, setLoad] as const;
}
