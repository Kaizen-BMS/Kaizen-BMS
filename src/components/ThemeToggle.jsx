"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STORAGE_KEY = "kbms-theme";

function getSystemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * A floating theme toggle, fixed over the page content rather than docked
 * in the header — the "hanging" pill the whole site's light/dark state
 * lives on. Persists the explicit choice; before any choice is made it
 * just reflects the OS preference (kaizen.css already handles that case
 * with no JS at all, so there's no flash on first load).
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null); // 'light' | 'dark' — resolved after mount

  useEffect(() => {
    const root = document.querySelector(".kbms-site");
    if (!root) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    const resolved =
      saved === "light" || saved === "dark"
        ? saved
        : getSystemPrefersDark()
          ? "dark"
          : "light";
    setTheme(resolved);
    if (saved) root.setAttribute("data-theme", saved);
  }, []);

  function toggle() {
    const root = document.querySelector(".kbms-site");
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
    <motion.button
      type="button"
      onClick={toggle}
      aria-label={
        theme === null
          ? "Toggle theme"
          : isDark
            ? "Switch to light mode"
            : "Switch to dark mode"
      }
      initial={{ opacity: 0, y: 16, scale: 0.85 }}
      animate={{ opacity: theme === null ? 0 : 1, y: 0, scale: 1 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="kbms-glass-light fixed bottom-6 right-6 z-60 flex h-12 w-12 items-center justify-center rounded-full text-(--kbms-ink)"
      style={{ pointerEvents: theme === null ? "none" : "auto" }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.svg
            key="sun"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.35 }}
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="4.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (Math.PI * 2 * i) / 8;
              const x1 = 12 + Math.cos(a) * 7.2;
              const y1 = 12 + Math.sin(a) * 7.2;
              const x2 = 12 + Math.cos(a) * 9.6;
              const y2 = 12 + Math.sin(a) * 9.6;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              );
            })}
          </motion.svg>
        ) : (
          <motion.svg
            key="moon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.35 }}
            aria-hidden="true"
          >
            <path
              d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
