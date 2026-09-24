import { apiRoute, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// An attendance photo, streamed only to a logged-in person of THIS facility who is allowed to see it
// (admin/owner, or the person it belongs to). Never a public URL; tenant-scoped through tenantDb.
export const GET = apiRoute(null, async (request, { session, params }) => {
  const { logId } = await params;
  if (!/^\d{1,18}$/.test(String(logId))) throw new HttpError(404, "not_found");
  const log = await tenantDb.attendance_logs.findUnique({ where: { id: BigInt(logId) } });
  if (!log) throw new HttpError(404, "not_found");
  const own = log.subject_type === "USER" && String(log.subject_id) === String(session.userId);
  if (!own && !can(session.role, "staff:manage") && !can(session.role, "attendance:proxy")) throw new HttpError(403, "forbidden");

  const which = new URL(request.url).searchParams.get("type") === "out" ? "out" : "in";
  const data = which === "out" ? log.check_out_photo_url : log.check_in_photo_url;
  const m = String(data || "").match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new HttpError(404, "no_photo");
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
});
