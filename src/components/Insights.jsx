"use client";

import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";

const ARTICLES = [
  {
    category: "Business Strategy",
    title: "What continuous improvement actually looks like in practice",
    description: "Small compounding changes beat one-off overhauls.",
    date: "Insight",
  },
  {
    category: "Technology",
    title: "Choosing between off-the-shelf and custom software",
    description: "When an ERP fits — and when to build your own.",
    date: "Insight",
  },
  {
    category: "Healthcare",
    title: "Operational visibility as a healthcare management problem",
    description: "How fragmented systems erode accountability.",
    date: "Insight",
  },
  {
    category: "Education",
    title: "Building institutional systems that outlast any one hire",
    description: "Processes that keep running when people leave.",
    date: "Insight",
  },
  {
    category: "Digital Growth",
    title: "Why visibility alone doesn't move revenue",
    description: "Connecting SEO, ads and content to a real pipeline.",
    date: "Insight",
  },
  {
    category: "Leadership",
    title: "Team accountability without adding bureaucracy",
    description: "Ownership that makes execution faster, not slower.",
    date: "Insight",
  },
];

export default function Insights() {
  return (
    <section
      id="insights"
      className="border-b border-(--kbms-line) py-11 md:py-16"
    >
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <SectionHeading
          eyebrow="Insights"
          title="Ideas for Better Business."
          size="xl"
        />

        <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-12 border-t border-(--kbms-line) pt-12 sm:grid-cols-2 md:mt-12 lg:grid-cols-3">
          {ARTICLES.map((a, i) => (
            <motion.a
              key={a.title}
              href="#contact"
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={{
                duration: 0.5,
                delay: (i % 3) * 0.08,
                ease: "easeOut",
              }}
              className="group flex flex-col"
            >
              <div className="flex items-center justify-between font-body text-xs font-medium uppercase tracking-[0.12em] text-[#08DCDC]">
                <span>{a.category}</span>
                <span>{a.date}</span>
              </div>
              <h3 className="font-display mt-3 text-lg leading-snug text-(--kbms-ink)">
                {a.title}
              </h3>
              <p className="font-body mt-3 text-sm leading-relaxed text-(--kbms-ink-soft)">
                {a.description}
              </p>
              <span className="mt-5 inline-flex items-center gap-2 font-body text-sm font-medium text-(--kbms-ink)">
                Read
                <span className="transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </span>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
