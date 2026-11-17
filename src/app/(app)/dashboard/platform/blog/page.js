import { guardPage } from "@/lib/pageGuard";
import BlogAdminClient from "./BlogAdminClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Blog" };

// Reachable by SUPER_ADMIN and the dedicated CONTENT_EDITOR role alike
// (rbac.js's SCOPE_RESTRICTED_ACTIONS for blogpost:read names both) —
// unlike every other /dashboard/platform/* page, which stays SUPER_ADMIN
// only. The "Blog Editors" sub-tab (who gets that responsibility) is
// SUPER_ADMIN-only, gated client-side by the viewerRole passed down here
// and re-enforced server-side by blogeditor:manage.
export default async function BlogAdminPage() {
  const { session } = await guardPage({ action: "blogpost:read" });
  return <BlogAdminClient viewerRole={session.role} />;
}
