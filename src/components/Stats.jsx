"use client";

import { motion } from "framer-motion";
import Counter from "./Counter";

const DEFAULT_STATS = [
  { value: 500, suffix: "+", label: "Clients Served" },
  { value: 15, suffix: "+", label: "Services Offered" },
  { value: 98, suffix: "%", label: "Client Satisfaction" },
];

export default function Stats({ stats = DEFAULT_STATS }) {
  return (
    <section className="border-y border-(--kbms-line)">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 divide-y divide-(--kbms-line) px-6 sm:grid-cols-3 sm:divide-x sm:divide-y-0 md:px-10">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -10% 0px" }}
            transition={{ duration: 0.6, delay: i * 0.12, ease: "easeOut" }}
            className="flex flex-col items-start gap-1 py-7 sm:px-8 md:py-10"
          >
            <div className="font-display text-[clamp(30px,3.4vw,48px)] leading-none text-(--kbms-ink)">
              <Counter
                value={stat.value}
                prefix={stat.prefix}
                suffix={stat.suffix}
              />
            </div>
            <div className="font-body text-[11px] font-medium uppercase tracking-[0.16em] text-(--kbms-ink-soft)">
              {stat.label}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
