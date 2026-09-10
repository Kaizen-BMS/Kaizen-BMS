"use client";

import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";

/**
 * A quiet, editorial name-list — used for both "partner hospitals" and
 * "top hiring companies". Plain typographic entries with thin dividers,
 * not logo cards, so it works whether or not real logo assets exist yet.
 */
export default function PartnerShowcase({
  eyebrow,
  title,
  supporting,
  names,
  note,
  noteCtaLabel,
  noteCtaHref,
}) {
  return (
    <section className="border-b border-(--kbms-line) py-11 md:py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          size="lg"
          supporting={supporting}
        />

        <div className="mt-10 flex flex-wrap gap-x-12 gap-y-6 border-t border-(--kbms-line) pt-10 md:mt-12 md:pt-12">
          {names.map((name, i) => (
            <motion.span
              key={name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: "easeOut" }}
              className="font-display text-lg text-(--kbms-ink) md:text-xl"
            >
              {name}
            </motion.span>
          ))}
        </div>

        {note && (
          <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-(--kbms-line) pt-8">
            <p className="font-body text-sm text-(--kbms-ink-soft)">{note}</p>
            {noteCtaLabel && (
              <a
                href={noteCtaHref || "#contact"}
                className="group inline-flex items-center gap-2 border-b border-(--kbms-ink)/30 pb-0.5 font-body text-sm font-medium text-(--kbms-ink) transition-colors hover:border-(--kbms-ink)"
              >
                {noteCtaLabel}
                <span className="transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
