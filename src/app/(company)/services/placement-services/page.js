import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import TaxonomyFilters from "@/components/TaxonomyFilters";
import JobListings from "@/components/JobListings";
import Testimonials from "@/components/Testimonials";
import PartnerShowcase from "@/components/PartnerShowcase";
import CTA from "@/components/CTA";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Placement Services",
  description:
    "Kaizen BMS placement services connect job seekers with verified employers across technology, healthcare, finance, education, marketing and sales — recruitment services and career advancement for candidates and businesses alike.",
  openGraph: {
    title: "Placement Services | Kaizen BMS",
    description:
      "Discover opportunities and get hired faster — Kaizen BMS recruitment and placement services connecting talent with verified employers across India.",
    url: "/services/placement-services",
    siteName: "Kaizen BMS",
    type: "website",
  },
};

const CONTACT_FIELDS = [
  { name: "name", placeholder: "Full Name", required: true },
  {
    name: "email",
    placeholder: "Email Address",
    type: "email",
    required: true,
  },
  { name: "phone", placeholder: "Phone Number", required: true },
  { name: "role", placeholder: "Position Interested In" },
  {
    name: "message",
    placeholder: "Tell us about your experience",
    type: "textarea",
  },
];

export default function PlacementServicesPage() {
  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Placement Services"
          title="Discover Opportunities."
          accent="Get Hired Faster."
          supporting="The right candidate and the right recruiter — the foundation of lasting success."
          primaryLabel="Find Jobs"
          primaryHref="#jobs"
          secondaryLabel="Post a Role"
          secondaryHref="#contact"
        />
        <TaxonomyFilters />
        <JobListings />
        <Testimonials />
        <PartnerShowcase
          eyebrow="Our Network"
          title="Top Hiring Companies."
          names={[
            "KaizenBMS",
            "Paul Scientific Works",
            "Nu Life Hospital",
            "Global Vista Educators",
          ]}
          note="Looking to hire through Kaizen BMS?"
          noteCtaLabel="Partner With Us"
          noteCtaHref="#contact"
        />
        <CTA
          headline="Ready to start your career journey?"
          supporting="For professionals finding their next role — and businesses finding their next hire."
          primaryLabel="Create Free Account"
          primaryHref="#contact"
          secondaryLabel="Explore Open Roles"
          secondaryHref="#jobs"
        />
        <Contact
          eyebrow="Get In Touch"
          title="Let's Find Your Next Opportunity."
          fields={CONTACT_FIELDS}
        />
      </main>
      <Footer />
    </>
  );
}
