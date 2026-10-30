import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "soft" | "link";

const VARIANTS: Record<Variant, string> = {
  primary:
    "h-12 rounded-full bg-accent px-6 font-display text-[13px] font-medium text-white",
  outline:
    "h-11 rounded-full border-[1.5px] border-accent-text bg-surface px-5 font-display text-xs font-medium text-accent-text",
  soft: "h-11 rounded-full bg-tint px-5 font-display text-xs font-medium text-tint-text",
  link: "text-sm font-semibold text-accent-text underline",
};

export function Button({
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** Round arrow badge used inside pill links ("All meetings", "Open agenda"). */
export function ArrowBadge({ back = false }: { back?: boolean }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
      <svg
        width="14"
        height="14"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
      >
        <path
          d={
            back
              ? "M15 9H3M7.5 4.5 3 9l4.5 4.5"
              : "M3 9h12M10.5 4.5 15 9l-4.5 4.5"
          }
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
