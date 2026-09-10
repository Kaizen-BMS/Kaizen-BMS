"use client";

import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";

const GROUPS = [
  {
    label: "Category",
    items: [
      "Technology",
      "Healthcare",
      "Finance",
      "Education",
      "Marketing",
      "Sales",
      "Operations",
    ],
  },
  {
    label: "Job Type",
    items: ["Full-Time", "Part-Time", "Contract", "Internship", "Freelance"],
  },
  { label: "Work Mode", items: ["Remote", "Hybrid", "On-Site"] },
  {
    label: "Experience",
    items: ["Fresher", "1–3 Years", "3–5 Years", "5–10 Years", "10+ Years"],
  },
];

/**
 * Editorial taxonomy display — the categories a real job-search filter bar
 * would use, shown as quiet chip groups rather than a functional filter UI
 * (there's no live job database behind this page yet).
 */
export default function TaxonomyFilters() {
  return (
    <section className="border-b border-(--kbms-line) py-11 md:py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <SectionHeading
          eyebrow="Browse By"
          title="Find Roles That Fit."
          size="md"
        />

        <div className="mt-10 space-y-8 border-t border-(--kbms-line) pt-10 md:mt-12 md:pt-12">
          {GROUPS.map((group, gi) => (
            <div
              key={group.label}
              className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:gap-8"
            >
              <p className="font-body w-32 shrink-0 text-xs font-medium uppercase tracking-[0.14em] text-(--kbms-ink-soft)">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-2.5">
                {group.items.map((item, i) => (
                  <motion.span
                    key={item}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "0px 0px -10% 0px" }}
                    transition={{ duration: 0.4, delay: gi * 0.05 + i * 0.03 }}
                    className="font-body border border-(--kbms-line) px-3.5 py-1.5 text-sm text-(--kbms-ink)"
                  >
                    {item}
                  </motion.span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
