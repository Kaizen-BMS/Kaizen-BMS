import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import Process from "@/components/Process";
import ServiceDetailGrid from "@/components/ServiceDetailGrid";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Digital Marketing",
  description:
    "Kaizen BMS digital marketing services — SEO, paid advertising, social media, branding and lead generation, tracked back to real leads rather than vanity numbers.",
  openGraph: {
    title: "Digital Marketing | Kaizen BMS",
    description:
      "SEO, paid ads, social, content and lead generation — marketing that earns attention, not just spends it.",
    url: "/services/digital-marketing",
    siteName: "Kaizen BMS",
    type: "website",
  },
};

const PROCESS_STAGES = [
  {
    n: "01",
    title: "Audit & Positioning",
    copy: "Understand your market and where you stand in it.",
  },
  {
    n: "02",
    title: "Channel Strategy",
    copy: "The right mix of channels for your budget and goals.",
  },
  {
    n: "03",
    title: "Content & Campaigns",
    copy: "Creative, copy and campaigns that sound like you.",
  },
  {
    n: "04",
    title: "Measure & Scale",
    copy: "Double down on what works, cut what doesn't.",
  },
];

const SERVICES = [
  {
    title: "SEO & Content",
    description: "Organic visibility that compounds over time.",
    features: [
      "Keyword & content strategy",
      "On-page & technical SEO",
      "Blog & long-form content",
      "Monthly ranking reports",
    ],
    ctaLabel: "Learn More",
  },
  {
    title: "Paid Advertising",
    description: "Ad spend that's tracked back to real leads.",
    features: [
      "Google & Meta ad campaigns",
      "Audience targeting & retargeting",
      "Landing page optimization",
      "Spend & ROI reporting",
    ],
    ctaLabel: "See How It Works",
  },
  {
    title: "Social Media & Branding",
    description: "A consistent presence people recognize.",
    features: [
      "Content calendars & posting",
      "Brand identity & visual guidelines",
      "Community management",
      "Influencer & partnership outreach",
    ],
    ctaLabel: "Get Started",
  },
  {
    title: "Lead Generation",
    description: "Turn traffic into a pipeline, not just visits.",
    features: [
      "Funnel & landing page design",
      "Email & WhatsApp campaigns",
      "CRM & lead tracking setup",
      "Conversion rate optimization",
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
  { name: "business", placeholder: "Business / Brand Name" },
  { name: "message", placeholder: "Message", type: "textarea" },
];

export default function DigitalMarketingPage() {
  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Digital Marketing"
          title="Marketing That"
          accent="Earns Attention, Not Just Spends It"
          supporting="SEO, paid ads, social and content — built for real leads, not vanity numbers."
          primaryLabel="Explore Services"
          primaryHref="#services"
          secondaryLabel="Book a Consultation"
          secondaryHref="#contact"
          image="/images/stock/marketing-dashboard.jpg"
          imageAlt="A laptop screen showing marketing analytics charts"
        />
        <Process
          id="approach"
          eyebrow="How KaizenBMS Works"
          title="A proven path: audit, strategize, create, measure."
          stages={PROCESS_STAGES}
        />
        <ServiceDetailGrid
          eyebrow="What We Offer"
          title="Our Core Services."
          supporting="SEO, paid ads, social, branding and lead generation."
          services={SERVICES}
        />
        <Contact
          eyebrow="Send Enquiry"
          title="Let's Talk About Your Brand."
          supporting="Our team will contact you within 24 hours."
          fields={CONTACT_FIELDS}
        />
      </main>
      <Footer />
    </>
  );
}
