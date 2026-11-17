import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Privacy Policy",
  description: "How Kaizen BMS collects, uses and protects your information on this website.",
  openGraph: {
    title: "Privacy Policy | Kaizen BMS",
    description: "How Kaizen BMS collects, uses and protects your information on this website.",
    url: "/privacy-policy",
    siteName: "Kaizen BMS",
    type: "website",
  },
};

const SECTIONS = [
  {
    heading: "1. Introduction",
    body: [
      "This Privacy Policy explains how Kaizen BMS (“we”, “us”, “our”) collects, uses and protects information when you visit this website or submit an enquiry through it. It applies to this public marketing website only, not to the separate Hospital Management System product we build for our hospital and clinic clients, which is covered by its own agreement with each client.",
    ],
  },
  {
    heading: "2. Information We Collect",
    body: [
      "When you submit an enquiry form on this website, we collect the details you provide — typically your name, company, email address, phone number, industry and the message or service you are enquiring about.",
      "We do not require you to create an account or log in to browse this website, and we do not knowingly collect sensitive personal information (such as health records) through it.",
    ],
  },
  {
    heading: "3. Cookies & Analytics",
    body: [
      "This website uses Google Analytics to understand how visitors use it — for example, which pages are viewed and how people arrive at the site. Google Analytics uses cookies and similar technologies that may collect your IP address and browsing behaviour on this site. This information is used in aggregate to improve the website; we do not use it to identify you individually.",
      "You can control or disable cookies through your browser settings at any time. Doing so may affect how parts of this website display but will not prevent you from browsing it or contacting us.",
    ],
  },
  {
    heading: "4. How We Use Your Information",
    body: [
      "We use the information you submit to respond to your enquiry, understand which of our services you are interested in, and follow up with you about that enquiry. We do not sell your personal information to third parties.",
    ],
  },
  {
    heading: "5. Sharing of Information",
    body: [
      "We do not share the information you submit through our enquiry form with third parties, except where required by law or where necessary to provide a service you have specifically asked us to connect you with (for example, a partner organisation such as Global Vista Educators for education consultancy, or a recruitment partner for job placements) — and only with your awareness at the time.",
    ],
  },
  {
    heading: "6. Data Security",
    body: [
      "We take reasonable technical and organisational measures to protect the information you submit from unauthorised access, loss or misuse. No method of transmission over the internet is completely secure, so we cannot guarantee absolute security.",
    ],
  },
  {
    heading: "7. Data Retention",
    body: [
      "We retain enquiry information for as long as reasonably necessary to respond to you and maintain our business records, after which it is deleted or anonymised.",
    ],
  },
  {
    heading: "8. Your Rights",
    body: [
      "You may ask us at any time to tell you what information we hold about you, to correct it, or to delete it. To do so, contact us using the details below.",
    ],
  },
  {
    heading: "9. Children's Privacy",
    body: [
      "This website is intended for business and institutional audiences and is not directed at children. We do not knowingly collect personal information from children.",
    ],
  },
  {
    heading: "10. Changes to This Policy",
    body: [
      "We may update this Privacy Policy from time to time to reflect changes to this website or our practices. The “Last updated” date below shows when it was last revised.",
    ],
  },
  {
    heading: "11. Contact Us",
    body: [
      "If you have any questions about this Privacy Policy or how we handle your information, contact us at mybusinessaffairs01@gmail.com or +91 98145 61099.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <Header />
      <main>
        <article className="pt-24 md:pt-28">
          <div className="mx-auto max-w-3xl px-6 md:px-10 pb-16">
            <p className="font-body text-xs font-medium uppercase tracking-[0.14em] text-[#16A34A]">
              Legal
            </p>
            <h1 className="font-display mt-3 text-[clamp(28px,4vw,42px)] font-normal leading-[1.15] tracking-tight text-(--kbms-ink)">
              Privacy Policy
            </h1>
            <p className="font-body mt-4 text-sm text-(--kbms-ink-soft)">
              Last updated: November 16, 2026
            </p>

            <div className="font-body mt-10 space-y-8 border-t border-(--kbms-line) pt-10 text-base leading-relaxed text-(--kbms-ink)">
              {SECTIONS.map((section) => (
                <div key={section.heading}>
                  <h2 className="font-display text-lg text-(--kbms-ink)">{section.heading}</h2>
                  <div className="mt-2 space-y-3 text-(--kbms-ink-soft)">
                    {section.body.map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
