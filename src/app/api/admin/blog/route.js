import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { slugify, SLUG_RE, parseJsonArray, toJsonArrayOrNull } from "@/lib/blog";

export const dynamic = "force-dynamic";

// Blog content is PLATFORM data (Kaizen's own public site, not tenant
// data) — raw `prisma` throughout, same as every other SUPER_ADMIN-style
// platform screen (tenants, module registry). Gated by blogpost:read/
// :manage, which rbac.js restricts to SUPER_ADMIN + CONTENT_EDITOR even
// against a tenant admin's own "*" wildcard — see rbac.js's
// SCOPE_RESTRICTED_ACTIONS.

/** Batch-attaches each post's author name/role — same pattern as radiology.js's attachDoctorNames(), avoiding a guess at the Prisma relation name for a single-FK-to-users column. */
async function attachAuthors(posts) {
  const ids = [...new Set(posts.map((p) => p.author_user_id).filter((id) => id != null))];
  if (ids.length === 0) return posts.map((p) => ({ ...p, author: null }));
  const users = await prisma.users.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, role: true },
  });
  const byId = new Map(users.map((u) => [String(u.id), u]));
  return posts.map((p) => ({
    ...p,
    key_points: parseJsonArray(p.key_points),
    gallery_images: parseJsonArray(p.gallery_images),
    author: p.author_user_id == null ? null : byId.get(String(p.author_user_id)) || null,
  }));
}

// Admin list — every post, draft or published, newest first.
export const GET = apiRoute("blogpost:read", async () => {
  const posts = await prisma.blog_posts.findMany({ orderBy: { created_at: "desc" } });
  return json({ posts: await attachAuthors(posts) });
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(255),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_RE, "lowercase letters, digits, hyphens only")
    .max(191)
    .optional(),
  excerpt: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(100),
  coverImage: z.string().max(5_000_000).optional().nullable(),
  content: z.string().trim().min(1),
  // Key Takeaways — short, scannable highlights shown near the top of the
  // post, separate from the prose body. Gallery — extra photos beyond the
  // one cover image, shown within the article. Both optional, both capped
  // so a post can't balloon the page.
  keyPoints: z.array(z.string().trim().min(1).max(300)).max(10).optional(),
  galleryImages: z.array(z.string().max(5_000_000)).max(12).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional().default("DRAFT"),
});

// The author is always whoever is actually creating the post (the signed-in
// SUPER_ADMIN or CONTENT_EDITOR) — never a field the caller sets directly,
// so "written by" on the public page is always true, not asserted.
export const POST = apiRoute("blogpost:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const slug = body.slug || slugify(body.title);
  if (!slug) throw new HttpError(400, "slug_required");

  const existing = await prisma.blog_posts.findUnique({ where: { slug }, select: { id: true } });
  if (existing) throw new HttpError(409, "slug_taken");

  const post = await prisma.blog_posts.create({
    data: {
      slug,
      title: body.title,
      excerpt: body.excerpt,
      category: body.category,
      cover_image: body.coverImage || null,
      content: body.content,
      key_points: toJsonArrayOrNull(body.keyPoints),
      gallery_images: toJsonArrayOrNull(body.galleryImages),
      status: body.status,
      author_user_id: session.userId,
      published_at: body.status === "PUBLISHED" ? new Date() : null,
    },
  });
  return json(
    { post: { ...post, key_points: parseJsonArray(post.key_points), gallery_images: parseJsonArray(post.gallery_images) } },
    201,
  );
});
