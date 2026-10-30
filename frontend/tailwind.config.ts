import type { Config } from "tailwindcss";

// Colors are CSS variables (src/index.css), so one class works in both themes.
const token = (name: string) => `var(--${name})`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: Object.fromEntries(
        [
          "bg",
          "text",
          "muted",
          "surface",
          "line",
          "field-line",
          "field-bg",
          "tint",
          "tint-text",
          "accent",
          "accent-text",
          "band",
          "ghost",
          "row",
          "danger",
        ].map((name) => [name, token(name)]),
      ),
      fontFamily: {
        display: ["Unbounded", "sans-serif"],
        brand: ["Rammetto One", "sans-serif"],
        sans: ["Manrope", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 10px 24px var(--shadow)",
        panel: "0 16px 36px var(--shadow)",
        form: "0 24px 48px var(--shadow)",
      },
    },
  },
  plugins: [],
} satisfies Config;
