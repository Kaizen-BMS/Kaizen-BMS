import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Stats from "@/components/Stats";
import HowWeWork from "@/components/HowWeWork";
import Partners from "@/components/Partners";
import CTA from "@/components/CTA";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Kaizen BMS | Business Management, Technology & Growth Partner",
  description:
    "Kaizen BMS partners with businesses and institutions on business management services, business consulting, digital transformation, hospital management, custom software development, website development, SEO services, digital marketing services and recruitment services — small improvements, extraordinary results.",
  openGraph: {
    title: "Kaizen BMS | Small Improvements. Extraordinary Results.",
    description:
      "Business consultancy, hospital management, custom software development, digital marketing services, website development, SEO and recruitment services — one transformation partner across healthcare, education, technology and business.",
    url: "/",
    siteName: "Kaizen BMS",
    type: "website",
  },
};

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Stats />
        <HowWeWork />
        <Partners />
        <CTA />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
