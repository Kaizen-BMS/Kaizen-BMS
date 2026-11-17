"use client";

import { motion } from "framer-motion";

// Compact "About" content folded directly into the homepage — the Mission/
// Vision/Approach statement a dedicated About page used to carry, condensed
// into one thin divided row (same visual idiom the old Stats bar used) so
// the page doesn't grow taller for it.
const VALUES = [
  {
    title: "Our Mission",
    copy: "Measurable improvement, every time.",
  },
  {
    title: "Our Vision",
    copy: "The transformation partner institutions trust.",
  },
  {
    title: "Our Approach",
    copy: "Honest numbers. Real execution.",
  },
];

export default function AboutStrip() {
  return (
    <section id="about" className="scroll-mt-24 border-b border-(--kbms-line) py-8 md:scroll-mt-28 md:py-10">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -10% 0px" }}
          transition={{ duration: 0.5 }}
          className="font-body max-w-2xl text-sm leading-relaxed text-(--kbms-ink-soft)"
        >
          <span className="font-medium text-(--kbms-ink)">About Kaizen BMS —</span>{" "}
          one partner across healthcare, education, technology and business
          growth.
        </motion.p>

        <div className="mt-6 grid grid-cols-1 divide-y divide-(--kbms-line) sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {VALUES.map((v, i) => (
            <motion.div
              key={v.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: "easeOut" }}
              className="py-3 sm:px-6 first:sm:pl-0"
            >
              <p className="font-body text-[11px] font-medium uppercase tracking-[0.14em] text-[#16A34A]">
                {v.title}
              </p>
              <p className="font-body mt-1 text-sm text-(--kbms-ink)">
                {v.copy}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
