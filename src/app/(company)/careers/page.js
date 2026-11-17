import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import SectionHeading from "@/components/SectionHeading";
import ServiceGlyph from "@/components/graphics/ServiceGlyph";
import JobListings from "@/components/JobListings";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Careers",
  description:
    "Build your career with Kaizen BMS — open roles across marketing, technology, healthcare operations and education, with real growth and flexible work.",
  openGraph: {
    title: "Careers at Kaizen BMS",
    description:
      "Join a team that values growth, collaboration and real impact across healthcare, education, technology and business.",
    url: "/careers",
    siteName: "Kaizen BMS",
    type: "website",
  },
};

const PERKS = [
  { title: "Growth Opportunities", copy: "Real ownership from day one." },
  { title: "Collaborative Culture", copy: "Small teams, direct impact." },
  { title: "Flexible Work Options", copy: "Remote & field roles available." },
  { title: "Competitive Benefits", copy: "Pay that matches performance." },
];

export default function CareersPage() {
  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Careers"
          title="Build Your Career"
          accent="With Kaizen BMS"
          supporting="Join a team that values growth, collaboration and real impact."
          dark
          image="/images/stock/team-office.jpg"
          imageAlt="A team of Kaizen BMS colleagues smiling together in the office"
          primaryLabel="View Open Roles"
          primaryHref="#jobs"
          secondaryLabel="Get in Touch"
          secondaryHref="#contact"
        />

        <section className="border-b border-(--kbms-line) py-11 md:py-16">
          <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
            <SectionHeading
              eyebrow="Why Work With Us"
              title="A Team Built on Ownership."
              size="xl"
              className="max-w-3xl"
            />

            <div className="mt-10 grid grid-cols-1 gap-10 border-t border-(--kbms-line) pt-10 sm:grid-cols-2 md:mt-12 md:grid-cols-4 md:pt-12">
              {PERKS.map((perk, i) => (
                <div key={perk.title}>
                  <ServiceGlyph index={i} size={56} />
                  <h3 className="font-display mt-4 text-lg text-(--kbms-ink)">
                    {perk.title}
                  </h3>
                  <p className="font-body mt-2 text-sm leading-relaxed text-(--kbms-ink-soft)">
                    {perk.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <JobListings />

        <Contact
          eyebrow="Get in Touch"
          title="Let's Talk About Your Next Role."
          supporting="Our team will get back to you within 24 hours."
          fields={[
            { name: "name", placeholder: "Your Name", required: true },
            { name: "phone", placeholder: "Phone Number", required: true },
            {
              name: "email",
              placeholder: "Email Address",
              type: "email",
              required: true,
            },
            { name: "role", placeholder: "Role You're Interested In" },
            { name: "message", placeholder: "Tell Us About Yourself", type: "textarea" },
          ]}
        />
      </main>
      <Footer />
    </>
  );
}
