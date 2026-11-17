"use client";

import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";

const JOBS = [
  {
    title: "Marketing Manager — Medical Line",
    company: "Kaizen BMS",
    location: "Pan India",
    type: "Full-time",
    salary: "₹10,000 – ₹40,000",
    skills: "Marketing & Sales",
  },
  {
    title: "Marketing Manager — Education Line",
    company: "Kaizen BMS",
    location: "Pan India",
    type: "Full-time",
    salary: "₹10,000 – ₹40,000",
    skills: "Marketing & Sales",
  },
];

/** Open-role cards — same card language as the rest of the redesigned site. */
export default function JobListings() {
  return (
    <section id="jobs" className="border-b border-(--kbms-line) py-11 md:py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <SectionHeading
          eyebrow="Open Roles"
          title="Recently Posted Opportunities."
          size="lg"
        />

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 md:mt-12">
          {JOBS.map((job, i) => (
            <motion.div
              key={job.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}
              className="flex flex-col rounded-2xl border border-(--kbms-line) bg-(--kbms-hover) p-7 shadow-[0_2px_14px_rgba(10,42,67,0.05)] transition-shadow hover:shadow-[0_10px_30px_rgba(10,42,67,0.1)]"
            >
              <p className="font-body text-xs font-medium uppercase tracking-[0.14em] text-[#16A34A]">
                {job.company}
              </p>
              <h3 className="font-display mt-2 text-lg leading-tight text-(--kbms-ink) md:text-xl">
                {job.title}
              </h3>
              <p className="font-body mt-3 text-sm text-(--kbms-ink-soft)">
                {job.location} · {job.type} · {job.skills}
              </p>

              <div className="mt-6 flex items-center justify-between border-t border-(--kbms-line) pt-5">
                <p className="font-display text-base text-(--kbms-ink)">
                  {job.salary}
                </p>
                <a
                  href="#contact"
                  className="group inline-flex items-center gap-2 rounded-full border border-(--kbms-ink)/25 px-4 py-2 font-body text-sm font-medium text-(--kbms-ink) transition-colors hover:border-(--kbms-ink)"
                >
                  Apply
                  <span className="transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </a>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
