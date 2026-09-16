import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

// Thin server wrapper — DashboardLayout (../layout.js) already redirects
// an unauthenticated/suspended session before this ever renders. All real
// data comes from GET /api/dashboard/overview, fetched client-side, so
// this screen can also subscribe to realtime updates the same way every
// other HMS screen does (CLAUDE.md "Dashboard — widget-driven overview")
// — a plain server component couldn't hold a live socket subscription.
export default function DashboardHome() {
  return <DashboardClient />;
}
