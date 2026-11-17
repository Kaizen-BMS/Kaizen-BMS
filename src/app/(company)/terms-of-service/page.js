import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of the Kaizen BMS website.",
  openGraph: {
    title: "Terms of Service | Kaizen BMS",
    description: "The terms that govern your use of the Kaizen BMS website.",
    url: "/terms-of-service",
    siteName: "Kaizen BMS",
    type: "website",
  },
};

const SECTIONS = [
  {
    heading: "1. Acceptance of Terms",
    body: [
      "By accessing or using this website, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use this website.",
    ],
  },
  {
    heading: "2. About Kaizen BMS",
    body: [
      "Kaizen BMS is a business management, technology and growth partner, working across hospital management, business consulting, custom software, website development & SEO, digital marketing, educational services and recruitment.",
      "This website describes our services and lets you submit an enquiry. It does not itself grant you any license to our software products — use of our Hospital Management System is governed by a separate agreement with each client.",
    ],
  },
  {
    heading: "3. Use of This Website",
    body: [
      "You agree to use this website only for lawful purposes, and not to attempt to interfere with its normal operation, security or availability. You must not submit false, misleading or malicious information through our enquiry form.",
    ],
  },
  {
    heading: "4. Intellectual Property",
    body: [
      "All content on this website — including text, graphics, logos and the Kaizen BMS name and mark — is the property of Kaizen BMS or its licensors and is protected by applicable intellectual property laws. You may not copy, reproduce or redistribute this content without our prior written consent.",
    ],
  },
  {
    heading: "5. Third-Party Links & Partners",
    body: [
      "This website links to third-party websites and partner organisations — for example Global Vista Educators for education consultancy, and partner job-placement platforms — for your convenience. We do not control these third-party websites and are not responsible for their content, policies or practices. Visiting a third-party website is at your own discretion and subject to that site's own terms.",
    ],
  },
  {
    heading: "6. No Warranty",
    body: [
      "This website and its content are provided “as is”, without warranties of any kind, express or implied. We do not guarantee that the website will be uninterrupted, error-free or free of viruses.",
    ],
  },
  {
    heading: "7. Limitation of Liability",
    body: [
      "To the fullest extent permitted by law, Kaizen BMS will not be liable for any indirect, incidental or consequential damages arising from your use of, or inability to use, this website.",
    ],
  },
  {
    heading: "8. Governing Law",
    body: [
      "These Terms of Service are governed by the laws of India, and any disputes arising from them will be subject to the jurisdiction of the courts in Punjab, India.",
    ],
  },
  {
    heading: "9. Changes to These Terms",
    body: [
      "We may update these Terms of Service from time to time. Continued use of this website after a change constitutes acceptance of the revised terms. The “Last updated” date below shows when they were last revised.",
    ],
  },
  {
    heading: "10. Contact Us",
    body: [
      "If you have any questions about these Terms of Service, contact us at mybusinessaffairs01@gmail.com or +91 98145 61099.",
    ],
  },
];

export default function TermsOfServicePage() {
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
              Terms of Service
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
