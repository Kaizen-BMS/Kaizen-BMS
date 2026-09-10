"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import SectionHeading from "./SectionHeading";

const PROBLEMS = [
  "Inefficient processes",
  "Disconnected systems",
  "Unclear accountability",
  "Weak digital presence",
  "Recruitment challenges",
  "Poor visibility",
  "Inconsistent growth",
];

const SOLUTIONS = [
  "Stronger systems",
  "Clearer processes",
  "Clear accountability",
  "Digital infrastructure",
  "Measurable KPIs",
  "Brand presence",
  "Sustainable growth",
];

export default function Transformation() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 70%", "end 40%"],
  });
  const flow = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section
      id="transformation"
      className="border-b border-(--kbms-line) bg-(--kbms-surface) py-11 md:py-16"
    >
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <SectionHeading
          eyebrow="Where We Start"
          title="From Problems to Progress."
          size="xl"
        />

        <div
          ref={ref}
          className="relative mt-10 grid grid-cols-1 gap-10 md:mt-14 md:grid-cols-2 md:gap-0"
        >
          <div className="md:pr-16">
            <p className="font-body text-xs font-medium uppercase tracking-[0.18em] text-(--kbms-ink-soft)">
              What businesses face
            </p>
            <ul className="mt-8 space-y-5">
              {PROBLEMS.map((item, i) => (
                <motion.li
                  key={item}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "0px 0px -10% 0px" }}
                  transition={{ duration: 0.5, delay: i * 0.06 }}
                  className="font-body border-b border-(--kbms-line) pb-5 text-base text-(--kbms-ink-soft) line-through decoration-(--kbms-line) md:text-lg"
                >
                  {item}
                </motion.li>
              ))}
            </ul>
          </div>

          {/* central flow indicator — thin line filling left → right as the section scrolls */}
          <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-(--kbms-line) md:block">
            <motion.div
              style={{ height: flow }}
              className="absolute left-0 top-0 w-px bg-[#08DCDC]"
            />
          </div>

          <div className="md:pl-16">
            <p className="font-body text-xs font-medium uppercase tracking-[0.18em] text-[#08DCDC]">
              What Kaizen BMS builds
            </p>
            <ul className="mt-8 space-y-5">
              {SOLUTIONS.map((item, i) => (
                <motion.li
                  key={item}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "0px 0px -10% 0px" }}
                  transition={{ duration: 0.5, delay: 0.1 + i * 0.06 }}
                  className="font-body flex items-center gap-3 border-b border-(--kbms-line) pb-5 text-base text-(--kbms-ink) md:text-lg"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#08DCDC]" />
                  {item}
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
