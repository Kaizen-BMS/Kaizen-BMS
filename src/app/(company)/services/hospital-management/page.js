import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import LiveDashboard from "@/components/LiveDashboard";
import Process from "@/components/Process";
import ServiceDetailGrid from "@/components/ServiceDetailGrid";
import PartnerShowcase from "@/components/PartnerShowcase";
import CTA from "@/components/CTA";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Hospital Management Services",
  description:
    "Kaizen BMS hospital management services — internal governance, staff accountability, hospital brand marketing, cloud analytics, hospital management software and healthcare recruitment, built for institutions that want stronger systems and sustainable growth.",
  openGraph: {
    title: "Hospital Management Services | Kaizen BMS",
    description:
      "Smart hospital management and strategic marketing — governance, OPD/IPD protocols, brand marketing, analytics, hospital software and healthcare recruitment under one partner.",
    url: "/services/hospital-management",
    siteName: "Kaizen BMS",
    type: "website",
  },
};

const PROCESS_STAGES = [
  {
    n: "01",
    title: "Client Assessment",
    copy: "Assess operations, challenges and growth goals.",
  },
  {
    n: "02",
    title: "Custom Strategy",
    copy: "A tailored plan for your size and goals — not a template.",
  },
  {
    n: "03",
    title: "Implementation",
    copy: "Implement systems, train staff, establish protocols — with your team.",
  },
  {
    n: "04",
    title: "Growth & Monitoring",
    copy: "Monthly reports and cloud dashboards track progress, revenue and KPIs.",
  },
];

const SERVICES = [
  {
    title: "Hospital Management",
    description:
      "Governance, staff accountability, OPD/IPD protocols and performance reviews.",
    features: [
      "Clear hospital organogram & role definitions",
      "OPD, IPD & Emergency protocols",
      "Professional Development Reviews (PDRs)",
      "Monthly action log & reporting",
    ],
    ctaLabel: "Learn More",
  },
  {
    title: "Hospital Brand Marketing",
    description: "Marketing that builds patient trust and footfall.",
    features: [
      "Brand identity & visual standards",
      "Digital marketing & social media",
      "Patient experience optimization",
      "Community outreach programs",
    ],
    ctaLabel: "Get Started",
  },
  {
    title: "Analytics & Growth",
    description:
      "Cloud dashboards and real-time reports for financial and operational growth.",
    features: [
      "Cloud-based OPD/IPD analytics",
      "Income vs. expenditure tracking",
      "Monthly KaizenBMS performance reports",
      "Cost-saving & investment insights",
    ],
    ctaLabel: "See How It Works",
  },
  {
    title: "Hospital Software",
    description:
      "Software that streamlines every department, reception to pharmacy to accounts.",
    features: [
      "Receptionist & OPD module",
      "Doctor prescription & IPD module",
      "Lab, pharmacy & accounts",
      "Attendance & payroll system",
    ],
    ctaLabel: "View System",
  },
  {
    title: "Placement Services",
    description:
      "Trained healthcare staff for every department, managers to receptionists.",
    features: [
      "Hospital managers & coordinators",
      "Marketing & HR executives",
      "Receptionists & front-desk staff",
      "IT support & system admins",
    ],
    ctaLabel: "View Openings",
    ctaHref: "/services/placement-services",
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
  { name: "hospital", placeholder: "Hospital / Organisation" },
  { name: "message", placeholder: "Message", type: "textarea" },
];

export default function HospitalManagementPage() {
  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Hospital Management"
          title="Transforming Hospitals Through Smart Management"
          accent="& Strategic Marketing"
          supporting="Stronger governance, culture and brand — so you can focus on patient care."
          primaryLabel="Explore Services"
          primaryHref="#services"
          secondaryLabel="Book a Consultation"
          secondaryHref="#contact"
        />
        <LiveDashboard />
        <Process
          id="approach"
          eyebrow="How KaizenBMS Works"
          title="A proven path: assessment, strategy, implementation, continuous growth."
          stages={PROCESS_STAGES}
        />
        <ServiceDetailGrid
          eyebrow="What We Offer"
          title="Our Core Services."
          supporting="Governance, marketing, analytics, software and recruitment."
          services={SERVICES}
        />
        <PartnerShowcase
          eyebrow="Our Network"
          title="Partner Hospitals."
          supporting="Hospitals that trust KaizenBMS to run and grow."
          names={["NuLife Hospital, Amritsar"]}
          note="Want your hospital on this list?"
          noteCtaLabel="Become a Partner Hospital"
          noteCtaHref="#contact"
        />
        <CTA
          headline="Ready to transform your hospital?"
          supporting="Stronger systems, better culture, sustainable growth."
          primaryLabel="Get Free Consultation"
          primaryHref="#contact"
          secondaryLabel="Explore Services"
          secondaryHref="#services"
        />
        <Contact
          eyebrow="Send Enquiry"
          title="Let's Talk About Your Hospital."
          supporting="Our team will contact you within 24 hours."
          fields={CONTACT_FIELDS}
        />
      </main>
      <Footer />
    </>
  );
}
