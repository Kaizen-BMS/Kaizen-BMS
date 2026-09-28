"use client";

// A print-only header for Reports/Analytics screens — invisible on screen
// (these pages already show their own title/filters there), but gives the
// PRINTED page a proper document header instead of just the raw dashboard
// content: report name, the range/filter it was run for, and when it was
// generated. Pairs with the print:hidden PrintButton and the global
// (app)/app.css print rules that let the page use the full sheet.
export default function ReportPrintHeader({ title, subtitle }) {
  const now = new Date();
  const printedAt = now.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="mb-4 hidden border-b border-black pb-2 print:block">
      <h1 className="text-lg font-semibold">{title}</h1>
      {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
      <p className="mt-1 text-xs text-slate-500">Printed {printedAt}</p>
    </div>
  );
}
