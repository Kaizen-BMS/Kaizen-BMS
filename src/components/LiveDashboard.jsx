"use client";

import { motion } from "framer-motion";
import Counter from "./Counter";
import SectionHeading from "./SectionHeading";

const METRICS = [
  { value: 248, label: "Patients Today" },
  { value: 12, label: "Departments" },
  { value: 94, suffix: "%", label: "Efficiency" },
  { value: 82, suffix: "%", label: "OPD Occupancy" },
  { value: 96, suffix: "%", label: "Staff Attendance" },
  { value: 74, suffix: "%", label: "Revenue Target" },
];

/**
 * Editorial stand-in for a live operations dashboard — oversized counted
 * numbers in a divided grid, not a boxed SaaS panel. The figures are the
 * same illustrative overview already published on Kaizen BMS's hospital
 * management page.
 */
export default function LiveDashboard() {
  return (
    <section className="border-b border-(--kbms-line) py-11 md:py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <SectionHeading
            eyebrow="Live Overview"
            title="A Hospital, Managed in Real Time."
            size="md"
          />
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "0px 0px -10% 0px" }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="font-body flex items-center gap-2 border border-(--kbms-line) px-3.5 py-1.5 text-sm text-(--kbms-ink)"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#08DCDC]" />
            Revenue up 24% vs. last month
          </motion.div>
        </div>

        <div className="mt-10 grid grid-cols-2 divide-x divide-y divide-(--kbms-line) border border-(--kbms-line) md:mt-12 md:grid-cols-3 md:divide-y-0">
          {METRICS.map((m, i) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={{
                duration: 0.5,
                delay: (i % 3) * 0.1,
                ease: "easeOut",
              }}
              className="flex flex-col gap-1 px-6 py-8 md:px-8 md:py-10"
            >
              <div className="font-display text-[clamp(24px,2.8vw,38px)] leading-none text-(--kbms-ink)">
                <Counter value={m.value} suffix={m.suffix} />
              </div>
              <div className="font-body text-xs font-medium uppercase tracking-[0.14em] text-(--kbms-ink-soft)">
                {m.label}
              </div>
            </motion.div>
          ))}
        </div>

        <p className="font-body mt-6 text-xs text-(--kbms-ink-soft)">
          Illustrative overview — secure, compliant data handling.
        </p>
      </div>
    </section>
  );
}
