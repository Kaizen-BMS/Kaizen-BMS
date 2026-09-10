"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import SectionHeading from "./SectionHeading";

const DEFAULT_STAGES = [
  {
    n: "01",
    title: "Client Assessment",
    copy: "Study operations, systems and gaps first.",
  },
  {
    n: "02",
    title: "Custom Strategy",
    copy: "A plan built around you, not a template.",
  },
  {
    n: "03",
    title: "Implementation",
    copy: "Systems, technology and people, moved together.",
  },
  {
    n: "04",
    title: "Growth & Monitoring",
    copy: "Tracked, refined and continuous — never one-off.",
  },
];

export default function Process({
  id = "about",
  eyebrow = "The Kaizen Approach",
  title = "Not one big change — a system of better decisions, better processes, better execution.",
  stages = DEFAULT_STAGES,
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 75%", "end 60%"],
  });
  const lineScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id={id} className="border-b border-(--kbms-line) py-11 md:py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          size="xl"
          className="max-w-5xl"
        />

        <div ref={ref} className="relative mt-12 md:mt-16">
          <div className="absolute left-0 right-0 top-[18px] hidden h-px bg-(--kbms-line) md:block" />
          <motion.div
            style={{ scaleX: lineScale }}
            className="absolute left-0 right-0 top-[18px] hidden h-px origin-left bg-[#08DCDC] md:block"
          />

          <div className="grid grid-cols-1 gap-12 md:grid-cols-4 md:gap-8">
            {stages.map((stage, i) => (
              <motion.div
                key={stage.n}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "0px 0px -15% 0px" }}
                transition={{ duration: 0.6, delay: i * 0.15, ease: "easeOut" }}
                className="relative"
              >
                <div className="relative z-10 mb-6 h-[9px] w-[9px] rounded-full bg-(--kbms-ink) md:mx-0" />
                <p className="font-body text-xs font-medium tracking-[0.16em] text-[#08DCDC]">
                  {stage.n}
                </p>
                <h3 className="font-display mt-2 text-2xl text-(--kbms-ink)">
                  {stage.title}
                </h3>
                <p className="mt-3 font-body text-sm leading-relaxed text-(--kbms-ink-soft)">
                  {stage.copy}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
