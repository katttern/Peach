import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "agenda-theme";

function savedTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light"; // Storage blocked (private mode, disabled site data).
  }
}

/** Light/dark theme on <html data-theme>, remembered per browser. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(savedTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not remembered; the toggle still works for this page.
    }
  }

  return [theme, toggle];
}
