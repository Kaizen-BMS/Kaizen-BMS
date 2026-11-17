import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import Process from "@/components/Process";
import ServiceDetailGrid from "@/components/ServiceDetailGrid";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Custom Software",
  description:
    "Kaizen BMS custom software development — ERP systems, web & mobile portals, workflow automation and enterprise applications, built to fit how your team actually works.",
  openGraph: {
    title: "Custom Software | Kaizen BMS",
    description:
      "ERP, portals, automation and enterprise apps — designed around your workflow, not a template.",
    url: "/services/custom-software",
    siteName: "Kaizen BMS",
    type: "website",
  },
};

const PROCESS_STAGES = [
  {
    n: "01",
    title: "Discovery",
    copy: "Map the real workflow before writing a line of code.",
  },
  {
    n: "02",
    title: "Architecture & Design",
    copy: "A system designed for your scale, not a template.",
  },
  {
    n: "03",
    title: "Build & Integrate",
    copy: "Development, testing and integration with your team.",
  },
  {
    n: "04",
    title: "Support & Scale",
    copy: "Monitoring, fixes and new features as you grow.",
  },
];

const SERVICES = [
  {
    title: "ERP & Business Systems",
    description: "Operations, inventory and finance in one system.",
    features: [
      "Multi-department workflows",
      "Inventory & procurement tracking",
      "Finance & reporting modules",
      "Role-based access control",
    ],
    ctaLabel: "Learn More",
  },
  {
    title: "Web & Mobile Portals",
    description: "Customer and staff portals that just work.",
    features: [
      "Customer self-service portals",
      "Staff & admin dashboards",
      "Secure authentication & roles",
      "Real-time notifications",
    ],
    ctaLabel: "Get Started",
  },
  {
    title: "Workflow Automation",
    description: "Remove the manual steps slowing your team down.",
    features: [
      "Approval & task automation",
      "Document generation & e-signatures",
      "Third-party API integrations",
      "Scheduled reports & alerts",
    ],
    ctaLabel: "See How It Works",
  },
  {
    title: "Enterprise Applications",
    description: "Purpose-built apps for specialised operations.",
    features: [
      "Hospital, retail & logistics apps",
      "Cloud hosting & deployment",
      "Ongoing maintenance & support",
      "Scalable multi-tenant architecture",
    ],
    ctaLabel: "Open Hospital App",
    ctaHref: "/login",
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
  { name: "company", placeholder: "Company / Organisation" },
  { name: "message", placeholder: "Message", type: "textarea" },
];

export default function CustomSoftwarePage() {
  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Custom Software"
          title="Software Built Around"
          accent="How You Actually Work"
          supporting="ERP, portals and automation — built to fit, not force a workflow."
          primaryLabel="Explore Services"
          primaryHref="#services"
          secondaryLabel="Start a Project"
          secondaryHref="#contact"
          image="/images/stock/developer-coding.jpg"
          imageAlt="A developer writing code on a laptop"
        />
        <Process
          id="approach"
          eyebrow="How KaizenBMS Works"
          title="A proven path: discover, design, build, support."
          stages={PROCESS_STAGES}
        />
        <ServiceDetailGrid
          eyebrow="What We Build"
          title="Our Core Services."
          supporting="ERP, portals, automation and enterprise applications."
          services={SERVICES}
        />
        <Contact
          eyebrow="Send Enquiry"
          title="Let's Talk About Your Project."
          supporting="Our team will contact you within 24 hours."
          fields={CONTACT_FIELDS}
        />
      </main>
      <Footer />
    </>
  );
}
