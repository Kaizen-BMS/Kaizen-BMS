import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { SLUG_RE, parseJsonArray, toJsonArrayOrNull } from "@/lib/blog";

export const dynamic = "force-dynamic";

async function findPost(id) {
  const postId = BigInt(id);
  const post = await prisma.blog_posts.findUnique({ where: { id: postId } });
  if (!post) throw new HttpError(404, "post_not_found");
  return post;
}

function withParsedArrays(post) {
  return { ...post, key_points: parseJsonArray(post.key_points), gallery_images: parseJsonArray(post.gallery_images) };
}

export const GET = apiRoute("blogpost:read", async (request, { params }) => {
  const { id } = await params;
  const post = await findPost(id);
  return json({ post: withParsedArrays(post) });
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_RE, "lowercase letters, digits, hyphens only")
    .max(191)
    .optional(),
  excerpt: z.string().trim().min(1).max(500).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  coverImage: z.string().max(5_000_000).optional().nullable(),
  content: z.string().trim().min(1).optional(),
  keyPoints: z.array(z.string().trim().min(1).max(300)).max(10).optional().nullable(),
  galleryImages: z.array(z.string().max(5_000_000)).max(12).optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

// A CONTENT_EDITOR may edit/publish any post, not only their own — "this is
// your responsibility" (the owner's own framing) means the blog as a
// whole, not a private drafts folder; SUPER_ADMIN and CONTENT_EDITOR are
// both trusted equally here, same as this project's other admin-tooling
// actions (CLAUDE.md's "*" wildcard precedent, just scoped to this one job).
export const PATCH = apiRoute("blogpost:manage", async (request, { params }) => {
  const { id } = await params;
  const existing = await findPost(id);
  const body = await parseBody(request, updateSchema);

  if (body.slug && body.slug !== existing.slug) {
    const taken = await prisma.blog_posts.findUnique({ where: { slug: body.slug }, select: { id: true } });
    if (taken) throw new HttpError(409, "slug_taken");
  }

  const data = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.slug !== undefined) data.slug = body.slug;
  if (body.excerpt !== undefined) data.excerpt = body.excerpt;
  if (body.category !== undefined) data.category = body.category;
  if (body.coverImage !== undefined) data.cover_image = body.coverImage || null;
  if (body.content !== undefined) data.content = body.content;
  if (body.keyPoints !== undefined) data.key_points = toJsonArrayOrNull(body.keyPoints);
  if (body.galleryImages !== undefined) data.gallery_images = toJsonArrayOrNull(body.galleryImages);
  if (body.status !== undefined) {
    data.status = body.status;
    // The FIRST time a post goes live its published_at is stamped; a later
    // unpublish/republish cycle keeps the original date rather than
    // reprinting the post as "new" each time an admin toggles it.
    if (body.status === "PUBLISHED" && !existing.published_at) data.published_at = new Date();
  }

  const post = await prisma.blog_posts.update({ where: { id: existing.id }, data });
  return json({ post: withParsedArrays(post) });
});

export const DELETE = apiRoute("blogpost:manage", async (request, { params }) => {
  const { id } = await params;
  await findPost(id);
  await prisma.blog_posts.delete({ where: { id: BigInt(id) } });
  return json({ ok: true });
});
