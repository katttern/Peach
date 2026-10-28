import { useRef, useState } from "react";

import { ApiError } from "../api/client";
import {
  countChars,
  MAX_PASTE_CHARS,
  parseAgenda,
  parserConfigured,
  type ParseResponse,
} from "../api/parser";
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
    <section
      className="grid gap-3 rounded border p-4"
      aria-label="Paste agenda"
    >
      <h2 className="text-xl font-semibold">Paste an agenda</h2>
      <p className="text-sm text-gray-600">
        Paste an email, chat or notes. We fill in the form below; nothing is
        saved until you review it and press Save.
      </p>
      <textarea
        className="min-h-40 rounded border px-3 py-2"
        aria-label="Pasted text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={busy}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={tooLong ? "text-red-700" : "text-gray-600"}>
          {length.toLocaleString("en-US")} /{" "}
          {MAX_PASTE_CHARS.toLocaleString("en-US")}
        </span>
        {tooLong && (
          <span className="text-red-700">
            Shorten the text to 10,000 characters to parse it.
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={() => void parse()}
          disabled={busy || empty || tooLong}
          className="disabled:opacity-50"
        >
          Parse
        </Button>
        {busy && (
          <>
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
              aria-hidden="true"
            />
            <span role="status" className="text-sm">
              Reading your agenda… usually 2–8 s
            </span>
            <button
              type="button"
              className="text-sm underline"
              onClick={() => controller.current?.abort()}
            >
              Cancel
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
