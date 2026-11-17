import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import Process from "@/components/Process";
import ServiceDetailGrid from "@/components/ServiceDetailGrid";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Website Development & SEO",
  description:
    "Kaizen BMS website development & SEO — custom websites, portals, search engine optimization and ongoing maintenance, built to bring the right visitors in and convert them.",
  openGraph: {
    title: "Website Development & SEO | Kaizen BMS",
    description:
      "Websites, portals and SEO that bring the right visitors in — design, build, rank, maintain.",
    url: "/services/website-development-seo",
    siteName: "Kaizen BMS",
    type: "website",
  },
};

const PROCESS_STAGES = [
  {
    n: "01",
    title: "Discovery & Content",
    copy: "Understand your audience before touching design.",
  },
  {
    n: "02",
    title: "Design & Build",
    copy: "A fast, accessible site designed around your brand.",
  },
  {
    n: "03",
    title: "SEO Foundation",
    copy: "Technical SEO and content structure, built in from day one.",
  },
  {
    n: "04",
    title: "Launch & Optimize",
    copy: "Track, test and improve after launch — not just at it.",
  },
];

const SERVICES = [
  {
    title: "Website Development",
    description: "Fast, responsive sites built for your business.",
    features: [
      "Custom design & development",
      "Mobile-first, responsive builds",
      "CMS for easy content updates",
      "E-commerce & booking integrations",
    ],
    ctaLabel: "Get Started",
  },
  {
    title: "Portals & Web Apps",
    description: "Beyond a brochure site — tools people actually use.",
    features: [
      "Customer & member portals",
      "Online forms & applications",
      "Secure logins & dashboards",
      "Third-party integrations",
    ],
    ctaLabel: "Learn More",
  },
  {
    title: "Search Engine Optimization",
    description: "Get found by the people already searching for you.",
    features: [
      "Technical SEO audits",
      "On-page & content optimization",
      "Local SEO & Google listings",
      "Monthly ranking reports",
    ],
    ctaLabel: "See How It Works",
  },
  {
    title: "Website Maintenance",
    description: "Security, uptime and updates handled for you.",
    features: [
      "Hosting & domain management",
      "Security monitoring & backups",
      "Content & plugin updates",
      "Performance optimization",
    ],
    ctaLabel: "Book a Consultation",
  },
];

const CONTACT_FIELDS = [
  { name: "name", placeholder: "Your Name", required: true },
  { name: "phone", placeholder: "Phone Number", required: true },
  {
    name: "email",
    placeholder: "Email Address",
    type: "email",
    required: true,
  },
  { name: "website", placeholder: "Current Website (if any)" },
  { name: "message", placeholder: "Message", type: "textarea" },
];

export default function WebsiteDevelopmentSeoPage() {
  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Website Development & SEO"
          title="Websites Built to"
          accent="Convert, Not Just Look Good"
          supporting="Websites, portals and SEO that bring the right visitors in."
          primaryLabel="Explore Services"
          primaryHref="#services"
          secondaryLabel="Get Started"
          secondaryHref="#contact"
          image="/images/stock/business-meeting.jpg"
          imageAlt="A team reviewing a website strategy together"
        />
        <Process
          id="approach"
          eyebrow="How KaizenBMS Works"
          title="A proven path: discover, design, build for search, optimize."
          stages={PROCESS_STAGES}
        />
        <ServiceDetailGrid
          eyebrow="What We Offer"
          title="Our Core Services."
          supporting="Development, portals, SEO and ongoing maintenance."
          services={SERVICES}
        />
        <Contact
          eyebrow="Send Enquiry"
          title="Let's Talk About Your Website."
          supporting="Our team will contact you within 24 hours."
          fields={CONTACT_FIELDS}
        />
      </main>
      <Footer />
    </>
  );
}
