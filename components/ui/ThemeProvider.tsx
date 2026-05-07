"use client";

import { useEffect } from "react";

/**
 * Reads the user's preferred mode from localStorage and applies it on <html>.
 * Theme is hard-locked to "joyful" (Calendly-like). User can toggle light/dark via the
 * topnav button which also writes to localStorage. Since this is the only place that
 * reads from localStorage, no SSR/hydration mismatch as long as the html attr starts at "light".
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = localStorage.getItem("rb_mode");
    if (saved === "dark" || saved === "light") {
      document.documentElement.dataset.mode = saved;
    }
  }, []);
  return <>{children}</>;
}
