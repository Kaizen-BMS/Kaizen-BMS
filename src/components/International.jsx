"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";

const CAPABILITIES = [
  "UK University Admissions",
  "Career Counselling",
  "University Applications",
  "Visa Assistance",
  "Global Academic Opportunities",
];

/** Slow orbital ring behind the partner logo — the "beyond borders" motif. */
function OrbitRings() {
  return (
    <motion.svg
      viewBox="0 0 400 400"
      className="pointer-events-none absolute inset-0 h-full w-full"
      animate={{ rotate: 360 }}
      transition={{ duration: 140, repeat: Infinity, ease: "linear" }}
      aria-hidden="true"
    >
      <circle
        cx="200"
        cy="200"
        r="180"
        fill="none"
        stroke="var(--kbms-line)"
        strokeWidth="1"
      />
      <circle
        cx="200"
        cy="200"
        r="140"
        fill="none"
        stroke="var(--kbms-line)"
        strokeWidth="1"
        strokeDasharray="2 8"
      />
      <circle cx="200" cy="20" r="4" fill="#08DCDC" />
      <circle cx="380" cy="200" r="3" fill="#6E5BFF" />
      <circle
        cx="200"
        cy="380"
        r="3"
        fill="var(--kbms-ink)"
        fillOpacity="0.5"
      />
    </motion.svg>
  );
}

export default function International() {
  return (
    <section
      id="global"
      className="border-b border-(--kbms-line) py-11 md:py-16"
    >
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-12 md:gap-10">
          <div className="order-2 md:order-1 md:col-span-5">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "0px 0px -15% 0px" }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative mx-auto flex aspect-square w-full max-w-[320px] items-center justify-center"
            >
              <OrbitRings />
              <div className="relative flex h-40 w-40 items-center justify-center border border-(--kbms-line) bg-white p-4 md:h-48 md:w-48">
                <Image
                  src="/images/Global Vista logo.png"
                  alt="Global Vista Educators"
                  width={320}
                  height={320}
                  className="h-full w-full object-contain"
                />
              </div>
            </motion.div>
          </div>

          <div className="order-1 md:order-2 md:col-span-7">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -15% 0px" }}
              transition={{ duration: 0.5 }}
              className="font-body inline-block border border-(--kbms-line) px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-(--kbms-ink-soft)"
            >
              In Partnership With Global Vista Educators
            </motion.p>

            <SectionHeading
              title="Growing Beyond Borders."
              size="lg"
              className="mt-4"
            />

            <p className="font-body mt-4 max-w-lg text-sm leading-relaxed text-(--kbms-ink-soft) md:text-base">
              With Global Vista Educators — UK admissions, counselling,
              applications and visa support.
            </p>

            <ul className="mt-6 flex flex-wrap gap-2">
              {CAPABILITIES.map((cap, i) => (
                <motion.li
                  key={cap}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "0px 0px -10% 0px" }}
                  transition={{ duration: 0.4, delay: i * 0.06 }}
                  className="font-body border border-(--kbms-line) px-3 py-1.5 text-sm text-(--kbms-ink)"
                >
                  {cap}
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
