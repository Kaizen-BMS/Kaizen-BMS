import QueueDisplayClient from "./QueueDisplayClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Now Serving", robots: { index: false, follow: false } };

// Deliberately outside (app) and (company) — no sidebar, no login-gated
// layout. Meant to run full-screen on a waiting-room TV. See
// src/app/api/display/[tenantSlug]/queue/route.js for the (public,
// no-PII) data this reads.
export default async function QueueDisplayPage({ params }) {
  const { tenantSlug } = await params;
  return <QueueDisplayClient tenantSlug={tenantSlug} />;
}
