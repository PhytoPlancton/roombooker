"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export function ThemeToggle() {
  const [mode, setMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("rb_mode");
    if (saved === "dark" || saved === "light") setMode(saved);
  }, []);

  const toggle = () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    document.documentElement.dataset.mode = next;
    localStorage.setItem("rb_mode", next);
  };

  return (
    <button className="btn btn-icon btn-ghost" onClick={toggle} title="Theme" type="button">
      {mode === "dark" ? <Icon.sun size={16} /> : <Icon.moon size={16} />}
    </button>
  );
}
