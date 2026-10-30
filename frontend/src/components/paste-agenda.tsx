import { useRef, useState } from "react";

import { ApiError } from "../api/client";
import {
  countChars,
  MAX_PASTE_CHARS,
  parseAgenda,
  parserConfigured,
  type ParseResponse,
} from "../api/parser";
import { Panel } from "./app-shell";
import { Button } from "./ui/button";

function messageFor(error: unknown): string {
  const status = error instanceof ApiError ? error.status : 0;
  switch (status) {
    case 413:
      return "Text is too long (max 10,000 characters)";
    case 422:
      return "Couldn't find an agenda in this text";
    case 429:
      return "The service is busy, try again in a minute";
    case 401:
      return "Session expired, sign in again";
    case 502:
    case 503:
    case 504:
      return "The AI service is unavailable right now — you can enter the agenda manually";
    default:
      return "Network error, try again";
  }
}

export function PasteAgenda({
  token,
  onParsed,
}: {
  token: string;
  onParsed: (result: ParseResponse) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const length = countChars(text);
  const tooLong = length > MAX_PASTE_CHARS;
  const empty = text.trim() === "";

  async function parse() {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError(null);
    try {
      onParsed(await parseAgenda(text, token, abort.signal));
    } catch (cause) {
      if (!abort.signal.aborted) setError(messageFor(cause));
    } finally {
      if (controller.current === abort) controller.current = null;
      setBusy(false);
    }
  }

  if (!parserConfigured) return null;

  return (
    <Panel aria-label="Paste agenda">
      <h2 className="m-0 font-display text-base font-medium">
        Paste an agenda
      </h2>
      <p className="m-0 text-[13px] leading-normal text-muted">
        Paste an email, chat or notes. We fill in the form below; nothing is
        saved until you review it and press Save.
      </p>
      <textarea
        className="min-h-32 resize-y rounded-[18px] border-[1.5px] border-field-line px-4 py-3.5 text-[15px]"
        aria-label="Pasted text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={busy}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={tooLong ? "text-danger" : "text-muted"}>
          {length.toLocaleString("en-US")} /{" "}
          {MAX_PASTE_CHARS.toLocaleString("en-US")}
        </span>
        {tooLong && (
          <span className="text-danger">
            Shorten the text to 10,000 characters to parse it.
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={() => void parse()}
          disabled={busy || empty || tooLong}
          variant="soft"
        >
          Parse
        </Button>
        {busy && (
          <>
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-tint border-t-accent-text"
              aria-hidden="true"
            />
            <span role="status" className="text-sm">
              Reading your agenda… usually 2–8 s
            </span>
            <button
              type="button"
              className="text-sm font-semibold text-accent-text underline"
              onClick={() => controller.current?.abort()}
            >
              Cancel
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </Panel>
  );
}
