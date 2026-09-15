"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";

/**
 * Specialist partners Kaizen brings in for what's outside its own core
 * work — each one solving a different problem, not the same thing twice.
 * Replaces the earlier single-partner "Growing Beyond Borders" spotlight
 * (education only) with a small logo-card grid so a second, unrelated
 * partner (lab/scientific instruments) reads clearly as a separate
 * relationship rather than a variant of the first.
 */
const PARTNERS = [
  {
    name: "Global Vista Educators",
    logo: "/images/Global Vista logo.png",
    tagline: "UK admissions & academic mentorship",
    description:
      "Connecting students with UK-based educators for admissions, counselling and visa support.",
    href: "https://globalvistaeducators.com/",
  },
  {
    name: "Paul Scientific Works",
    logo: "/images/Paul Scientific Works logo.png",
    tagline: "Scientific & laboratory instruments",
    description:
      "ISO 9001:2015 certified manufacturer and exporter of scientific, laboratory and medical instruments since 1989.",
    href: "https://paulscientificworks.com/",
  },
];

/** Thin rotating ring behind each logo — same "systems connecting" motif the old single-partner section used. */
function OrbitRing({ reverse = false }) {
  return (
    <motion.svg
      viewBox="0 0 200 200"
      className="pointer-events-none absolute inset-0 h-full w-full"
      animate={{ rotate: reverse ? -360 : 360 }}
      transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="92" fill="none" stroke="var(--kbms-line)" strokeWidth="1" />
      <circle cx="100" cy="8" r="2.5" fill="#08DCDC" />
    </motion.svg>
  );
}

export default function Partners() {
  return (
    <section id="partners" className="border-b border-(--kbms-line) py-11 md:py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <SectionHeading
          eyebrow="Our Partners"
          title="Specialists We Bring In."
          size="lg"
          supporting="For what's beyond our own core work — each partner solving a different problem."
        />

        <div className="mt-10 grid grid-cols-1 gap-6 md:mt-12 md:grid-cols-2 md:gap-8">
          {PARTNERS.map((p, i) => (
            <motion.a
              key={p.name}
              href={p.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}
              className="group flex items-center gap-5 border border-(--kbms-line) p-6 transition-colors hover:border-(--kbms-ink)/30"
            >
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center border border-(--kbms-line) bg-white p-3">
                <OrbitRing reverse={i % 2 === 1} />
                <Image
                  src={p.logo}
                  alt={p.name}
                  width={160}
                  height={160}
                  className="relative h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <p className="font-body text-[11px] font-medium uppercase tracking-[0.12em] text-(--kbms-ink-soft)">
                  {p.tagline}
                </p>
                <p className="font-display mt-1 text-lg text-(--kbms-ink) md:text-xl">
                  {p.name}
                </p>
                <p className="font-body mt-1.5 text-sm leading-relaxed text-(--kbms-ink-soft)">
                  {p.description}
                </p>
                <span className="mt-2 inline-flex items-center gap-1.5 font-body text-sm font-medium text-(--kbms-ink) opacity-80">
                  Visit website
                  <span className="transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
