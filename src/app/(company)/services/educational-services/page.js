import Header from "@/components/Header";
import PageHero from "@/components/PageHero";
import Process from "@/components/Process";
import ServiceDetailGrid from "@/components/ServiceDetailGrid";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Educational Services",
  description:
    "Kaizen BMS educational services — academic support, career counselling, STEM enrichment and institutional development for students, parents and schools.",
  openGraph: {
    title: "Educational Services | Kaizen BMS",
    description:
      "Academic support, career counselling, STEM programs and institutional development — one partner for students and schools alike.",
    url: "/services/educational-services",
    siteName: "Kaizen BMS",
    type: "website",
  },
};

const PROCESS_STAGES = [
  {
    n: "01",
    title: "Needs Assessment",
    copy: "Understand the student's or institution's real gaps first.",
  },
  {
    n: "02",
    title: "Learning Plan",
    copy: "A path built around ability, not a fixed syllabus.",
  },
  {
    n: "03",
    title: "Delivery & Mentoring",
    copy: "Structured sessions, counselling and hands-on STEM work.",
  },
  {
    n: "04",
    title: "Progress Tracking",
    copy: "Regular review so improvement is visible, not assumed.",
  },
];

const SERVICES = [
  {
    title: "Academic Support",
    description: "One-to-one and group tutoring across core subjects.",
    features: [
      "Subject-wise doubt clearing",
      "Exam & board-prep coaching",
      "Progress tracking for parents",
      "Flexible online & in-person formats",
    ],
    ctaLabel: "Enquire Now",
  },
  {
    title: "Career Counselling",
    description: "Guidance for the choices that shape a career.",
    features: [
      "Stream & course selection",
      "Aptitude & interest mapping",
      "College & scholarship guidance",
      "One-on-one counselling sessions",
    ],
    ctaLabel: "Book a Session",
  },
  {
    title: "STEM Enrichment",
    description: "Hands-on science, tech, engineering & maths programs.",
    features: [
      "Coding & robotics workshops",
      "Science project mentoring",
      "Olympiad & competition prep",
      "School partnership programs",
    ],
    ctaLabel: "Learn More",
  },
  {
    title: "Institutional Development",
    description: "Stronger systems for schools and coaching centres.",
    features: [
      "Curriculum & assessment design",
      "Staff training & workshops",
      "Digital learning tools",
      "Performance reporting for institutions",
    ],
    ctaLabel: "Get Started",
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
  { name: "institution", placeholder: "Student / School / Institution" },
  { name: "message", placeholder: "Message", type: "textarea" },
];

export default function EducationalServicesPage() {
  return (
    <>
      <Header />
      <main>
        <PageHero
          eyebrow="Educational Services"
          title="Academic Support Built Around"
          accent="Every Student"
          supporting="Career counselling, STEM enrichment and stronger systems for schools."
          primaryLabel="Explore Services"
          primaryHref="#services"
          secondaryLabel="Book a Consultation"
          secondaryHref="#contact"
          image="/images/stock/lecture-hall.jpg"
          imageAlt="Students attentively listening in a lecture hall"
        />
        <Process
          id="approach"
          eyebrow="How KaizenBMS Works"
          title="A proven path: assess, plan, deliver, track progress."
          stages={PROCESS_STAGES}
        />
        <ServiceDetailGrid
          eyebrow="What We Offer"
          title="Our Core Services."
          supporting="Tutoring, counselling, STEM programs and institutional support."
          services={SERVICES}
        />
        <Contact
          eyebrow="Send Enquiry"
          title="Let's Talk About Your Learning Goals."
          supporting="Our team will contact you within 24 hours."
          fields={CONTACT_FIELDS}
        />
      </main>
      <Footer />
    </>
  );
}
