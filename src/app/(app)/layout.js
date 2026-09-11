import "../globals.css";
import "./app.css";

export const metadata = {
  title: {
    default: "Kaizen HMS",
    template: "%s | Kaizen HMS",
  },
  robots: { index: false, follow: false },
};

/**
 * Route group for the logged-in Hospital Management System. Kept separate
 * from the (company) marketing group so the two never share chrome, fonts,
 * or the theme system. Auth is enforced by proxy.js on /dashboard/* and
 * /api/*; layouts below re-check as defense in depth. Product design tokens
 * live in ./app.css.
 */
export default function AppLayout({ children }) {
  return (
    <div className="min-h-full" style={{ background: "var(--hms-bg)", color: "var(--hms-ink)" }}>
      {children}
    </div>
  );
}
