"use client";

// Deliberately minimal — no imports beyond React, no font/CSS modules, no
// hooks besides what's inlined here. Next.js 16.x's own built-in
// global-error component has a confirmed, still-unresolved upstream bug
// (crashes prerendering with "Cannot read properties of null (reading
// 'useContext')" — see CLAUDE.md "Deployment gotchas"). Supplying our own
// replaces that internal component entirely, so whatever is broken inside
// Next's default one no longer runs. Renders its own <html>/<body> because
// this replaces the root layout when an error escapes every other boundary.
export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: "#555" }}>Please try again.</p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            borderRadius: "6px",
            border: "1px solid #ccc",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
