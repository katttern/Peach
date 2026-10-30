import {
  useEffect,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { useTheme } from "../lib/theme";
import { AuthBar } from "./auth-bar";

// Glass pebbles per page, placed relative to the centre like in the design.
const DECOR: Record<string, CSSProperties[]> = {
  meetings: [
    {
      top: 60,
      left: "calc(50% - 760px)",
      width: 330,
      height: 250,
      borderRadius: "71% 29% 54% 46% / 38% 62% 38% 62%",
      transform: "rotate(-23deg)",
    },
    {
      top: 128,
      right: "calc(50% - 418px)",
      width: 38,
      height: 31,
      borderRadius: "60% 40% 52% 48% / 55% 45% 55% 45%",
    },
    {
      top: 410,
      right: "calc(50% - 700px)",
      width: 300,
      height: 92,
      borderRadius: "999px 60px 999px 140px",
      transform: "rotate(-37deg)",
    },
    {
      top: 880,
      left: "calc(50% - 690px)",
      width: 112,
      height: 84,
      borderRadius: "35% 65% 44% 56% / 62% 38% 62% 38%",
      transform: "rotate(31deg)",
    },
    {
      top: 1010,
      right: "calc(50% - 760px)",
      width: 260,
      height: 260,
      borderRadius: "47% 53% 58% 42% / 51% 44% 56% 49%",
    },
  ],
  agenda: [
    {
      top: 40,
      right: "calc(50% - 790px)",
      width: 340,
      height: 270,
      borderRadius: "38% 62% 71% 29% / 55% 33% 67% 45%",
      transform: "rotate(14deg)",
    },
    {
      top: 170,
      left: "calc(50% - 545px)",
      width: 96,
      height: 74,
      borderRadius: "64% 36% 48% 52% / 40% 58% 42% 60%",
      transform: "rotate(-17deg)",
    },
    {
      top: 520,
      left: "calc(50% - 720px)",
      width: 280,
      height: 78,
      borderRadius: "999px 40px 999px 120px",
      transform: "rotate(33deg)",
    },
    {
      top: 1010,
      right: "calc(50% - 640px)",
      width: 150,
      height: 128,
      borderRadius: "47% 53% 32% 68% / 60% 40% 60% 40%",
      transform: "rotate(-41deg)",
    },
    {
      top: 1330,
      left: "calc(50% - 800px)",
      width: 300,
      height: 300,
      borderRadius: "52% 48% 44% 56% / 47% 55% 45% 53%",
    },
  ],
};

// Glass peaches (body, cleft, leaf) per page.
const PEACHES: Record<string, CSSProperties[]> = {
  meetings: [
    {
      top: 440,
      left: "calc(50% - 610px)",
      width: 170,
      height: 182,
      transform: "rotate(-12deg)",
    },
    {
      top: 236,
      right: "calc(50% - 476px)",
      width: 66,
      height: 72,
      transform: "rotate(18deg)",
    },
    {
      top: 700,
      right: "calc(50% - 690px)",
      width: 210,
      height: 224,
      transform: "rotate(9deg)",
    },
  ],
  agenda: [
    {
      top: 590,
      right: "calc(50% - 660px)",
      width: 200,
      height: 214,
      transform: "rotate(14deg)",
    },
    {
      top: 980,
      left: "calc(50% - 560px)",
      width: 88,
      height: 94,
      transform: "rotate(-22deg)",
    },
    {
      top: 1490,
      right: "calc(50% - 470px)",
      width: 56,
      height: 60,
      transform: "rotate(30deg)",
    },
  ],
};

const SECTION = { meetings: "Meetings", agenda: "Agenda" };

function Brand({ section }: { section: string }) {
  return (
    <div className="flex items-center gap-3">
      <a
        href="/"
        aria-label="Peach, all meetings"
        className="inline-flex items-center gap-2.5 no-underline"
      >
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
          <defs>
            <linearGradient id="pkLogo" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFD2B8" />
              <stop offset="0.55" stopColor="#F59A8F" />
              <stop offset="1" stopColor="#DE6F8E" />
            </linearGradient>
          </defs>
          <path
            d="M20 11c-3-2.6-9-2.6-12.2 1.6C4.4 17 5 25.4 10.3 30.6c4.2 4 11.2 4.4 16 1.2 5.6-3.8 7.6-11.6 4.6-17.4C28.5 9.8 23.4 8.7 20 11Z"
            fill="url(#pkLogo)"
          />
          <path
            d="M20 11.5c-2.6 5.2-2.4 12.6 1.2 20.5"
            stroke="#FFFFFF"
            strokeOpacity="0.7"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M20 11c1-4.6 5.4-7.4 10.4-6.6-1.2 4.6-5.4 7.2-10.4 6.6Z"
            fill="#8DBF8B"
          />
          <ellipse
            cx="12.5"
            cy="17"
            rx="3"
            ry="1.6"
            fill="#FFFFFF"
            opacity="0.7"
            transform="rotate(-35 12.5 17)"
          />
        </svg>
        <span className="font-brand text-2xl tracking-[0.5px] text-accent-text">
          peach
        </span>
      </a>
      <span aria-hidden="true" className="h-[26px] w-[1.5px] bg-line" />
      <span className="font-display text-xs font-medium uppercase tracking-[0.08em] text-muted">
        {section}
      </span>
    </div>
  );
}

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      className="inline-flex h-12 items-center gap-2 rounded-full border-[1.5px] border-line bg-surface pl-[7px] pr-4 font-display text-xs font-medium"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-tint text-tint-text">
        {dark ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="4.5"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      Dark mode
    </button>
  );
}

/**
 * Page frame from the design: top bar with the Peach brand, a big pale word
 * behind the header, glass pebbles and peaches, the header block and a full-width pink band below it.
 * `overlap` pulls the band up under the header (the Meetings form).
 */
export function AppShell({
  ghost,
  header,
  children,
  overlap = false,
}: {
  ghost: "meetings" | "agenda";
  header: ReactNode;
  children?: ReactNode;
  overlap?: boolean;
}) {
  useEffect(() => {
    document.title = `${SECTION[ghost]} · Peach`;
  }, [ghost]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg text-text">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-16 z-0 -translate-x-1/2 whitespace-nowrap font-display font-medium leading-none tracking-[-0.04em] text-ghost"
        style={{ fontSize: "clamp(90px, 17vw, 250px)" }}
      >
        {ghost}
      </div>
      {DECOR[ghost].map((style, i) => (
        <span key={i} className="glass" aria-hidden="true" style={style} />
      ))}
      {PEACHES[ghost].map((style, i) => (
        <div key={i} className="peach" aria-hidden="true" style={style}>
          <span className="glass peachy peach-body" />
          <span className="peach-cleft" />
          <span className="glass leaf peach-leaf" />
        </div>
      ))}

      <div className="relative z-[4] flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <Brand section={SECTION[ghost]} />
        <div className="flex flex-wrap items-center gap-2.5">
          <ThemeToggle />
          <AuthBar />
        </div>
      </div>

      <main className="relative z-[2] mx-auto flex max-w-[640px] flex-col gap-6 px-5 pt-5">
        {header}
      </main>

      {children && (
        <div
          className={`relative z-[1] bg-band px-5 pb-24 transition-colors ${overlap ? "-mt-36 pt-44" : "mt-8 pt-12"}`}
        >
          <div className="mx-auto max-w-[600px]">{children}</div>
        </div>
      )}
    </div>
  );
}

/** Rounded white section on the band (Paste an agenda, Add agenda). */
export function Panel({
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-[32px] bg-surface p-[26px] shadow-panel ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}
