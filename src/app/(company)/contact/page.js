import Header from "@/components/Header";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Contact",
  description:
    "Get in touch with Kaizen BMS — business consulting, hospital management, custom software, digital marketing and education services. Our team replies within 24 hours.",
  openGraph: {
    title: "Contact Kaizen BMS",
    description:
      "Have a question or need expert advice? Reach out and our team will get back to you within 24 hours.",
    url: "/contact",
    siteName: "Kaizen BMS",
    type: "website",
  },
};

export default function ContactPage() {
  return (
    <>
      <Header />
      <main className="pt-24 md:pt-28">
        <Contact
          eyebrow="Get in Touch"
          title="Let's Talk."
          supporting="Have a question or need expert advice? We'd love to hear from you."
        />
      </main>
      <Footer />
    </>
  );
}
