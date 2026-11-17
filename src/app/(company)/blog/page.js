import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import SectionHeading from "@/components/SectionHeading";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import { prisma } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog",
  description:
    "Perspectives from Kaizen BMS — hospital management, business consulting and digital transformation, and education consultancy.",
  openGraph: {
    title: "Insights | Kaizen BMS",
    description:
      "Articles from our work across healthcare, business and education.",
    url: "/blog",
    siteName: "Kaizen BMS",
    type: "website",
  },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(d) {
  const date = new Date(d);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export default async function BlogPage() {
  // Public, unauthenticated route — same raw `prisma` as every other
  // platform-content screen; blog_posts carries no tenant_id.
  const posts = await prisma.blog_posts.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { published_at: "desc" },
  });

  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Insights"
          title="Latest Articles"
          accent="& Insights"
          supporting="Perspectives from our work across healthcare, business and education."
          image="/images/stock/office-skyscrapers.jpg"
          imageAlt="Modern glass office towers against a blue sky"
          primaryLabel="Explore Services"
          primaryHref="/#how-we-work"
          secondaryLabel="Get in Touch"
          secondaryHref="#contact"
        />

        <section
          id="articles"
          className="border-b border-(--kbms-line) py-11 md:py-16"
        >
          <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
            <SectionHeading eyebrow="Recent Posts" title="From the Team." size="lg" />

            {posts.length === 0 ? (
              <p className="font-body mt-10 text-sm text-(--kbms-ink-soft)">
                No articles published yet — check back soon.
              </p>
            ) : (
              <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 md:mt-12 lg:grid-cols-3">
                {posts.map((post) => (
                  <a
                    key={post.slug}
                    href={`/blog/${post.slug}`}
                    className="group flex flex-col overflow-hidden rounded-xl border border-(--kbms-line) bg-(--kbms-hover) shadow-[0_2px_10px_rgba(10,42,67,0.04)] transition-shadow hover:shadow-[0_12px_26px_rgba(10,42,67,0.12)]"
                  >
                    <div className="h-40 w-full overflow-hidden bg-(--kbms-ink)/5">
                      {post.cover_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.cover_image}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : null}
                    </div>

                    <div className="flex flex-1 flex-col p-6">
                      <p className="font-body text-xs font-medium uppercase tracking-[0.14em] text-[#16A34A]">
                        {post.category}
                      </p>
                      <h3 className="font-display mt-2 text-lg leading-tight text-(--kbms-ink)">
                        {post.title}
                      </h3>
                      <p className="font-body mt-2 text-sm leading-relaxed text-(--kbms-ink-soft)">
                        {post.excerpt}
                      </p>

                      <div className="mt-5 flex items-center justify-between border-t border-(--kbms-line) pt-4">
                        <time className="font-body text-xs text-(--kbms-ink-soft)">
                          {formatDate(post.published_at || post.created_at)}
                        </time>
                        <span className="inline-flex items-center gap-1.5 font-body text-sm font-medium text-[#16A34A]">
                          Read More
                          <span className="transition-transform duration-300 group-hover:translate-x-1">
                            →
                          </span>
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>

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
