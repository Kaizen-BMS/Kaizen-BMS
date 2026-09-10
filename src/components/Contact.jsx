"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import SectionHeading from "./SectionHeading";

const FIELD_CLASS =
  "w-full border-0 border-b border-(--kbms-line) bg-transparent py-3 font-body text-base text-(--kbms-ink) placeholder:text-(--kbms-ink-soft)/60 outline-none transition-colors focus:border-[#08DCDC]";

const DEFAULT_FIELDS = [
  { name: "name", placeholder: "Name", required: true },
  { name: "company", placeholder: "Company" },
  { name: "email", placeholder: "Email", type: "email", required: true },
  { name: "phone", placeholder: "Phone" },
  { name: "industry", placeholder: "Industry" },
  { name: "service", placeholder: "Service Required" },
  { name: "message", placeholder: "Message", type: "textarea" },
];

export default function Contact({
  id = "contact",
  eyebrow = "Contact",
  title = "Let's Build Something Better.",
  supporting,
  fields = DEFAULT_FIELDS,
  submitLabel = "Send Enquiry",
  successNote = "Our team will get back to you shortly.",
}) {
  const [sent, setSent] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <section id={id} className="border-b border-(--kbms-line) py-11 md:py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-4">
            <SectionHeading
              eyebrow={eyebrow}
              title={title}
              supporting={supporting}
              size="md"
            />

            <div className="mt-10 space-y-5 border-t border-(--kbms-line) pt-8">
              <div>
                <p className="font-body text-xs font-medium uppercase tracking-[0.14em] text-(--kbms-ink-soft)">
                  Location
                </p>
                <p className="font-body mt-1.5 text-base text-(--kbms-ink)">
                  Kaizen BMS, Punjab, India
                </p>
              </div>
              <div>
                <p className="font-body text-xs font-medium uppercase tracking-[0.14em] text-(--kbms-ink-soft)">
                  Email
                </p>
                <a
                  href="mailto:mybusinessaffairs01@gmail.com"
                  className="font-body mt-1.5 block break-words text-base text-(--kbms-ink) hover:text-[#08DCDC]"
                >
                  mybusinessaffairs01@gmail.com
                </a>
              </div>
              <div>
                <p className="font-body text-xs font-medium uppercase tracking-[0.14em] text-(--kbms-ink-soft)">
                  Phone
                </p>
                <a
                  href="tel:+919814561099"
                  className="font-body mt-1.5 block text-base text-(--kbms-ink) hover:text-[#08DCDC]"
                >
                  +91 98145 61099
                </a>
              </div>
            </div>
          </div>

          <div className="md:col-span-8">
            {sent ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex h-full min-h-[320px] flex-col justify-center border border-(--kbms-line) px-8 py-16"
              >
                <p className="font-display text-2xl text-(--kbms-ink)">
                  Thank you.
                </p>
                <p className="font-body mt-3 max-w-md text-(--kbms-ink-soft)">
                  {successNote}
                </p>
              </motion.div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2"
              >
                {fields.map((field) =>
                  field.type === "textarea" ? (
                    <textarea
                      key={field.name}
                      name={field.name}
                      placeholder={field.placeholder}
                      required={field.required}
                      rows={4}
                      className={`${FIELD_CLASS} resize-none sm:col-span-2`}
                    />
                  ) : (
                    <input
                      key={field.name}
                      name={field.name}
                      type={field.type || "text"}
                      placeholder={field.placeholder}
                      required={field.required}
                      className={FIELD_CLASS}
                    />
                  ),
                )}
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="kbms-glass group mt-2 inline-flex items-center gap-2 px-7 py-3.5 font-body text-sm font-medium text-(--kbms-bg) transition-colors hover:bg-[#08DCDC] hover:text-(--kbms-ink)"
                  >
                    {submitLabel}
                    <span className="transition-transform duration-300 group-hover:translate-x-1">
                      →
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
