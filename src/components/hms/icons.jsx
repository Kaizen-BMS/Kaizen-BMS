"use client";

/**
 * The HMS product icon set — one small, consistent, stroke-based family
 * drawn in-house (no icon-pack dependency). 20x20 viewBox, 1.6 stroke,
 * round caps/joins, currentColor. Add new glyphs here as modules arrive so
 * the whole product stays visually coherent.
 */
const P = {
  overview: "M3 10.5 10 4l7 6.5M5 9.5V16h4v-4h2v4h4V9.5",
  opd:
    "M6 3v4a3 3 0 0 0 6 0V3M9 13v1.5a3.5 3.5 0 1 0 7 0V12M16 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  pharmacy:
    "M7.5 3.5h5M10 3.5V8M5.5 9.5 4 14a3 3 0 0 0 3 4h6a3 3 0 0 0 3-4l-1.5-4.5A2 2 0 0 0 11.6 8H8.4a2 2 0 0 0-1.9 1.5ZM6.5 13h7",
  lab: "M8 3h4M9 3v5L5 15a2 2 0 0 0 1.8 3h6.4A2 2 0 0 0 15 15l-4-7V3M7.5 12h5",
  ipd: "M3 7v10M3 12h11a3 3 0 0 1 3 3v2M6.5 9.5A1.5 1.5 0 1 0 6.5 6.5a1.5 1.5 0 0 0 0 3Z",
  radiology:
    "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM10 6v8M6.5 8l7 4M13.5 8l-7 4",
  registration:
    "M13 3H5.5A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V6l-3-3ZM12 3v3h3M7 10h6M7 13h4",
  billing:
    "M5 3h10v14l-2-1.3L11 17l-2-1.3L7 17l-2-1.3V3ZM8 7h4M8 10h4",
  appointments:
    "M4 5h12v11H4zM4 8h12M8 3v3M12 3v3M9 11l1.5 1.5L13 10",
  reports:
    "M4 4v12h12M7 13V9M10.5 13V6M14 13v-3",
  staff:
    "M7 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 17c0-2.2 1.8-4 4-4s4 1.8 4 4M13.5 9a2 2 0 1 0 0-4M13 13c2 0 3.5 1.5 3.5 4",
  forms:
    "M6 3h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM8 7h4M8 10h4M8 13h2",
  referral:
    "M5.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM14.5 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM7.5 8.5l5 4.2M12.5 8l-5 4.5",
  branding:
    "M10 3l1.9 3.9 4.3.6-3.1 3 .7 4.3L10 15.8 6.3 17.8l.7-4.3-3.1-3 4.3-.6L10 3Z",
  tenants:
    "M4 17V6l5-3 5 3v11M4 17h12M8 9h2M8 12h2M12 9h2M12 12h2",
  createTenant: "M10 4v12M4 10h12",
  registry:
    "M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z",
  bell:
    "M10 3a4 4 0 0 0-4 4c0 4-1.5 5-1.5 5h11S14 11 14 7a4 4 0 0 0-4-4ZM8.5 16a1.7 1.7 0 0 0 3 0",
  search: "M9 15A6 6 0 1 0 9 3a6 6 0 0 0 0 12ZM17 17l-3.8-3.8",
  command:
    "M7 3a2 2 0 1 1-2 2v10a2 2 0 1 1 2-2h6a2 2 0 1 1 2 2V5a2 2 0 1 1-2 2H7Z",
  chevron: "M7 4l6 6-6 6",
  logout: "M8 4H4v12h4M13 13l3-3-3-3M7 10h9",
  user: "M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17c0-3 2.7-5 6-5s6 2 6 5",
  panelLeft:
    "M4 4h12v12H4zM8 4v12",
};

export default function Icon({ name, className = "", size = 18 }) {
  const d = P[name] || P.overview;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
