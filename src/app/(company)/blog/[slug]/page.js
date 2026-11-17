import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import Header from "@/components/Header";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import BlogShare from "@/components/BlogShare";
import { prisma } from "@/lib/prismaClient";
import { paragraphsOf, authorDisplay, parseJsonArray } from "@/lib/blog";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(d) {
  const date = new Date(d);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function readingTime(content) {
  const words = String(content || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

async function getPost(slug) {
  const post = await prisma.blog_posts.findUnique({ where: { slug } });
  if (!post || post.status !== "PUBLISHED") return null;
  const withArrays = { ...post, key_points: parseJsonArray(post.key_points), gallery_images: parseJsonArray(post.gallery_images) };
  if (post.author_user_id == null) return { ...withArrays, author: null };
  const author = await prisma.users.findUnique({
    where: { id: post.author_user_id },
    select: { name: true, role: true },
  });
  return { ...withArrays, author };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: `${post.title} | Kaizen BMS`,
      description: post.excerpt,
      url: `/blog/${post.slug}`,
      siteName: "Kaizen BMS",
      type: "article",
      ...(post.cover_image ? { images: [{ url: post.cover_image }] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const { name, roleLabel } = authorDisplay(post.author);
  // Derived from the real incoming request, not hardcoded — correct in
  // dev (localhost) and in production alike.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("host") || "kaizenbms.in";
  const url = `${proto}://${host}/blog/${post.slug}`;

  return (
    <>
      <Header />
      <main>
        <article className="pt-24 md:pt-28">
          <div className="mx-auto max-w-3xl px-6 md:px-10">
            <Link
              href="/blog"
              className="font-body text-sm text-(--kbms-ink-soft) transition-colors hover:text-(--kbms-ink)"
            >
              ← Back to Insights
            </Link>

            <p className="font-body mt-8 text-xs font-medium uppercase tracking-[0.14em] text-[#16A34A]">
              {post.category}
            </p>
            <h1 className="font-display mt-3 text-[clamp(28px,4vw,42px)] font-normal leading-[1.15] tracking-tight text-(--kbms-ink)">
              {post.title}
            </h1>
            <p className="font-body mt-4 text-sm text-(--kbms-ink-soft)">
              {formatDate(post.published_at || post.created_at)} · Written by {name}
              {roleLabel ? ` · ${roleLabel}` : ""} · {readingTime(post.content)} min read
            </p>

            {post.cover_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.cover_image}
                alt=""
                className="mt-8 h-56 w-full rounded-xl object-cover md:h-80"
              />
            ) : null}

            {Array.isArray(post.key_points) && post.key_points.length > 0 ? (
              <div className="mt-8 rounded-xl border border-(--kbms-line) bg-(--kbms-hover) p-6">
                <p className="font-display text-sm font-medium uppercase tracking-[0.1em] text-[#16A34A]">
                  Key Takeaways
                </p>
                <ul className="font-body mt-3 space-y-2">
                  {post.key_points.map((point, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-(--kbms-ink)">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#16A34A]" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="font-body mt-10 space-y-6 border-t border-(--kbms-line) pt-10 text-base leading-relaxed text-(--kbms-ink)">
              {paragraphsOf(post.content).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>

            {Array.isArray(post.gallery_images) && post.gallery_images.length > 0 ? (
              <div className="mt-10 border-t border-(--kbms-line) pt-8">
                <p className="font-display text-sm font-medium uppercase tracking-[0.1em] text-(--kbms-ink-soft)">
                  Gallery
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {post.gallery_images.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={src}
                      alt=""
                      className="h-28 w-full rounded-lg object-cover sm:h-32"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-10 border-t border-(--kbms-line) pt-6">
              <BlogShare url={url} title={post.title} />
            </div>
          </div>
        </article>

        <Contact
          eyebrow="Send Enquiry"
          title="Let's Build Something Better."
          supporting="Our team will get back to you within 24 hours."
        />
      </main>
      <Footer />
    </>
  );
}
