import type { ButtonHTMLAttributes } from "react";

export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`rounded bg-slate-900 px-4 py-2 text-white ${className}`}
      {...props}
    />
  );
}
