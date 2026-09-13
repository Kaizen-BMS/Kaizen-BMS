"use client";

import { useEffect, useState } from "react";
import Icon from "./icons";

const STORAGE_KEY = "hms-theme";

function getSystemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Topbar light/dark toggle for the HMS product — same persisted-choice-
 * wins-over-system-preference pattern as the marketing site's ThemeToggle,
 * scoped to `.hms-shell` instead of `.kbms-site`. See app.css for the
 * token system this flips.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null); // resolved after mount, avoids SSR mismatch

  useEffect(() => {
    const root = document.querySelector(".hms-shell");
    if (!root) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    const resolved =
      saved === "light" || saved === "dark" ? saved : getSystemPrefersDark() ? "dark" : "light";
    setTheme(resolved);
    if (saved) root.setAttribute("data-theme", saved);
  }, []);

  function toggle() {
    const root = document.querySelector(".hms-shell");
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (root) root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable (private mode etc.) — theme just won't persist
    }
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === null ? "Toggle theme" : isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-md p-1.5 text-[var(--hms-ink-soft)] hover:bg-slate-100"
    >
      <Icon name={isDark ? "sun" : "moon"} size={17} />
    </button>
  );
}
