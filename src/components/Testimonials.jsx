"use client";

import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";

const TESTIMONIALS = [
  {
    quote:
      "As a recruiter, I've hired 15+ top talents through Kaizen. The candidate quality is exceptional.",
    name: "Amit Patel",
    role: "HR Manager, GlobalSoft",
  },
  {
    quote:
      "The AI matching was incredibly accurate. I received opportunities perfectly aligned with my skills.",
    name: "Priya Sharma",
    role: "Senior Developer, InnovateTech",
  },
  {
    quote:
      "Found my dream job within 2 weeks. The interview scheduling feature made everything so smooth.",
    name: "Rajesh Kumar",
    role: "Product Manager, TechCorp",
  },
];

/** Minimal editorial quote blocks — no card chrome, just serif quotes and a thin rule. */
export default function Testimonials() {
  return (
    <section className="border-b border-(--kbms-line) py-11 md:py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <SectionHeading
          eyebrow="Success Stories"
          title="From Our Community."
          size="lg"
        />

        <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-12 border-t border-(--kbms-line) pt-10 md:mt-12 md:grid-cols-3 md:pt-12">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={{ duration: 0.55, delay: i * 0.12, ease: "easeOut" }}
            >
              <p className="font-display text-base leading-snug text-(--kbms-ink) md:text-lg">
                “{t.quote}”
              </p>
              <p className="font-body mt-6 text-sm font-medium text-(--kbms-ink)">
                {t.name}
              </p>
              <p className="font-body mt-0.5 text-sm text-(--kbms-ink-soft)">
                {t.role}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
