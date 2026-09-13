"use client";

// Hidden in print media — this is the on-screen convenience only.
export default function PrintButton({ label = "Print" }) {
  return (
    <button
      onClick={() => window.print()}
      className="mb-4 rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-white print:hidden"
    >
      {label}
    </button>
  );
}
