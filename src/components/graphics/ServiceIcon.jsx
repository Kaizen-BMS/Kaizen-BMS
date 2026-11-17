"use client";

/**
 * Simple, literal line icons for the homepage services grid — one per
 * service, recognizable at a glance (a hospital cross, a graduation cap,
 * etc.) rather than the abstract node-cluster glyph (ServiceGlyph.jsx),
 * which read as decorative noise here. Hand-drawn SVG, not an icon library,
 * consistent with this site's own "custom SVG only" rule — just literal
 * instead of abstract.
 */
const ICONS = {
  "hospital-management": (
    <>
      <rect x="4" y="9" width="16" height="12" rx="1.5" />
      <path d="M9 21v-5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5" />
      <path d="M8 9V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v4" />
      <path d="M12 6.2v3.6M10.2 8h3.6" />
    </>
  ),
  "educational-services": (
    <>
      <path d="M2 8.5 12 4l10 4.5-10 4.5-10-4.5Z" />
      <path d="M6 10.6V15c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.4" />
      <path d="M21 9v6" />
    </>
  ),
  "jobs-placement": (
    <>
      <rect x="3" y="8" width="18" height="12" rx="1.5" />
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18M10.5 13v1.6h3V13" />
    </>
  ),
  "custom-software": (
    <>
      <path d="m9 8-4 4 4 4" />
      <path d="m15 8 4 4-4 4" />
      <path d="m13.5 6-3 12" />
    </>
  ),
  "website-development-seo": (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M3 9h18" />
      <circle cx="5.5" cy="7" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="7.3" cy="7" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="14" r="2.6" />
      <path d="m20 18-2.2-2.2" />
    </>
  ),
  "digital-marketing": (
    <>
      <path d="M4 15v-3a1 1 0 0 1 1-1h2l5-3v11l-5-3H5a1 1 0 0 1-1-1Z" />
      <path d="M15 9.5a3 3 0 0 1 0 5" />
      <path d="M17.5 7a6 6 0 0 1 0 10" />
    </>
  ),
};

export default function ServiceIcon({ slug, size = 18 }) {
  const paths = ICONS[slug];
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}
