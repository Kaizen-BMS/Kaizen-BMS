import "../globals.css";

export const metadata = {
  title: { default: "Patient Portal", template: "%s | Patient Portal" },
  robots: { index: false, follow: false },
};

/**
 * The Patient Portal's own route group — deliberately separate chrome from
 * both (app) (the staff HMS product) and (company) (the marketing site).
 * Plain Tailwind defaults, no `.hms-shell` retint: this is a lightweight,
 * mobile-first consumer surface, not the staff dashboard, and doesn't need
 * that system's dark mode or data-entry-dense styling.
 */
export default function PatientLayout({ children }) {
  return <div className="min-h-full bg-slate-50 text-slate-900">{children}</div>;
}
