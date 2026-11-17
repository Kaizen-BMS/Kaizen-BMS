import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

// Thin server wrapper — DashboardLayout (../layout.js) already redirects
// an unauthenticated/suspended session before this ever renders. All real
// data comes from GET /api/dashboard/overview, fetched client-side, so
// this screen can also subscribe to realtime updates the same way every
// other HMS screen does (CLAUDE.md "Dashboard — widget-driven overview")
// — a plain server component couldn't hold a live socket subscription.
//
// CONTENT_EDITOR has tenantId null like SUPER_ADMIN, but /api/dashboard/
// overview's platform branch (getPlatformOverview) is a SUPER_ADMIN-shaped
// view (tenant counts across the whole platform) that a blog-only account
// has no reason to see — send them straight to the one screen their role
// is actually for instead of a dashboard built for a different job.
export default async function DashboardHome() {
  const session = await getSession();
  if (session?.role === "CONTENT_EDITOR") redirect("/dashboard/platform/blog");
  return <DashboardClient />;
}
