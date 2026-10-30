import type { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-12 min-w-0 rounded-2xl border-[1.5px] border-field-line px-4 text-[15px] font-normal ${className}`}
      {...props}
    />
  );
}
