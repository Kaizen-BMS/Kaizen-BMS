"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SERVICES, serviceHref } from "@/lib/services";

/**
 * The services rail — a slim vertical strip of icons pinned to the right
 * edge of every page. Click an icon to slide out a panel with that
 * service's name, one line and an "Explore →" link. This replaces the
 * on-page Services section and the old header switcher.
 */

/**
 * One distinct abstract mark per service — geometric (nodes, lines, arcs,
 * brackets), in the site's own SVG language rather than a stock icon set,
 * but each hinting at what its service is.
 */
const A = "#08DCDC";
const MARKS = {
  "hospital-management": (
    <>
      <line
        x1="12"
        y1="4"
        x2="12"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="12" cy="12" r="3" fill={A} />
    </>
  ),
  "educational-services": (
    <>
      <path
        d="M3 8 L12 4 L21 8 L12 12 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M7 10 V15 Q12 18 17 15 V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="12" cy="8" r="1.6" fill={A} />
    </>
  ),
  "jobs-placement": (
    <>
      <circle
        cx="7"
        cy="7"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="17" cy="17" r="3" fill={A} />
      <line
        x1="9.2"
        y1="9.2"
        x2="14.8"
        y2="14.8"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </>
  ),
  "custom-software": (
    <>
      <path
        d="M9 6 L4 12 L9 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 6 L20 12 L15 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="1.5" fill={A} />
    </>
  ),
  "expert-consultancy": (
    <>
      <circle
        cx="12"
        cy="12"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M12 6 L15 12 L12 18 L9 12 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="1.5" fill={A} />
    </>
  ),
  "website-development-seo": (
    <>
      <rect
        x="4"
        y="5"
        width="16"
        height="12"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <line
        x1="4"
        y1="9"
        x2="20"
        y2="9"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="14" cy="13" r="3" fill="none" stroke={A} strokeWidth="1.4" />
      <line
        x1="16.2"
        y1="15.2"
        x2="19"
        y2="18"
        stroke={A}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
  "digital-marketing": (
    <>
      <path
        d="M4 17 L10 11 L13 14 L20 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 6 H20 V11"
        fill="none"
        stroke={A}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  "educational-consultancy": (
    <>
      <circle
        cx="12"
        cy="12"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <ellipse
        cx="12"
        cy="12"
        rx="3.4"
        ry="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <circle cx="16" cy="8" r="1.6" fill={A} />
    </>
  ),
  "online-marketplace": (
    <>
      {[7, 12, 17].map((x) =>
        [7, 12, 17].map((y) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" fill="currentColor" />
        )),
      )}
      <circle cx="12" cy="12" r="1.7" fill={A} />
    </>
  ),
};

function RailGlyph({ slug }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      {MARKS[slug] || null}
    </svg>
  );
}

export default function ServiceRail() {
  const [openSlug, setOpenSlug] = useState(null);
  const wrapRef = useRef(null);
  const open = SERVICES.find((s) => s.slug === openSlug) || null;

  useEffect(() => {
    if (!openSlug) return;
    const onKey = (e) => e.key === "Escape" && setOpenSlug(null);
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setOpenSlug(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [openSlug]);

  return (
    <div
      ref={wrapRef}
      className="fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 md:block"
    >
      <div className="flex items-stretch">
        <AnimatePresence>
          {open && (
            <motion.div
              key={open.slug}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="mr-[-1px] w-64 self-center border border-(--kbms-line) bg-(--kbms-bg) p-5 shadow-[-8px_0_28px_rgba(0,0,0,0.1)]"
            >
              <p className="font-body text-[10px] font-medium uppercase tracking-[0.16em] text-[#08DCDC]">
                {open.status === "coming-soon" ? "Coming soon" : "Service"}
              </p>
              <h3 className="font-display mt-1.5 text-lg leading-tight text-(--kbms-ink)">
                {open.title}
              </h3>
              <p className="font-body mt-2 text-sm leading-relaxed text-(--kbms-ink-soft)">
                {open.description}
              </p>
              {open.status !== "coming-soon" && (
                <a
                  href={serviceHref(open)}
                  onClick={() => setOpenSlug(null)}
                  className="group mt-4 inline-flex items-center gap-2 border-b border-[#08DCDC] pb-0.5 font-body text-sm font-medium text-(--kbms-ink) transition-colors hover:text-[#08DCDC]"
                >
                  Explore
                  <span className="transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </a>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col border-y border-l border-(--kbms-line) bg-(--kbms-bg) shadow-[-6px_0_20px_rgba(0,0,0,0.07)]">
          <span
            className="font-body select-none border-b border-(--kbms-line) py-3 text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-(--kbms-ink-soft)"
            style={{ writingMode: "vertical-rl" }}
          >
            Services
          </span>
          {SERVICES.map((service) => {
            const isOpen = openSlug === service.slug;
            return (
              <button
                key={service.slug}
                type="button"
                title={service.title}
                aria-label={service.title}
                aria-expanded={isOpen}
                onClick={() => setOpenSlug(isOpen ? null : service.slug)}
                className={`flex h-12 w-12 items-center justify-center border-b border-(--kbms-line) transition-colors last:border-b-0 ${
                  isOpen
                    ? "bg-(--kbms-ink) text-(--kbms-bg)"
                    : "text-(--kbms-ink) hover:bg-(--kbms-hover)"
                }`}
              >
                <RailGlyph slug={service.slug} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
