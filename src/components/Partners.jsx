"use client";

import Image from "next/image";
import SectionHeading from "./SectionHeading";

/**
 * Associates / partners Kaizen works with — specialist vendors and partner
 * institutions alike. Rendered as a continuously drifting logo carousel
 * (paused on hover) rather than a static grid, since the list has grown
 * past what reads well as fixed cards.
 */
const PARTNERS = [
  {
    name: "Global Vista Educators",
    logo: "/images/Global Vista logo.png",
    tagline: "Admissions & Career Counselling",
    href: "https://globalvistaeducators.com/",
  },
  {
    name: "Paul Scientific Works",
    logo: "/images/Paul Scientific Works logo.png",
    tagline: "Scientific & Laboratory Instruments",
    href: "https://paulscientificworks.com/",
  },
  {
    name: "Punjab School Education Board",
    logo: "/images/PSEB logo.jpg",
    tagline: "School Education & Examinations",
    href: "https://pseb.ac.in/",
  },
  {
    name: "Khalsa College of Engineering & Technology",
    logo: "/images/KCET logo.png",
    tagline: "Engineering Education, Amritsar",
    href: "https://khalsaengineering.co.in/",
  },
  {
    name: "Khalsa College for Women",
    logo: "/images/KCW logo.png",
    tagline: "Women's Higher Education, Amritsar",
    href: "https://kcwasr.edu.in/",
  },
  {
    name: "Shahzada Nand College",
    logo: "/images/Shahzada Nand College logo.png",
    tagline: "Higher Education, Amritsar",
    href: "https://www.shahzadanandcollege.org/",
  },
];

// Rendered twice back to back and animated by exactly -50% so the loop is
// seamless — a standard continuous logo-marquee technique.
const TRACK = [...PARTNERS, ...PARTNERS];

export default function Partners() {
  return (
    <section id="partners" className="border-b border-(--kbms-line) py-11 md:py-16">
      <div className="mx-auto max-w-[1400px] px-6 md:pl-10 md:pr-16 lg:pr-20">
        <SectionHeading
          eyebrow="Our Associates"
          title="Partners We Work With."
          size="lg"
          supporting="Specialists and institutions we bring in for what's beyond our own core work."
        />
      </div>

      <div className="group relative mt-10 overflow-hidden md:mt-12 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
        {/* kbms-drift (kaizen.css) — a plain CSS keyframe, not Framer Motion,
            specifically so group-hover can pause it: a JS-driven animate()
            loop doesn't respond to animation-play-state, a CSS one does. */}
        <div className="kbms-drift flex w-max items-stretch gap-6 group-hover:[animation-play-state:paused]">
          {TRACK.map((p, i) => (
            <a
              key={`${p.name}-${i}`}
              href={p.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex w-[240px] shrink-0 flex-col items-center gap-3 border border-(--kbms-line) bg-(--kbms-bg) px-6 py-7 text-center transition-colors hover:border-(--kbms-ink)/30"
            >
              <div className="flex h-16 w-full items-center justify-center">
                <Image
                  src={p.logo}
                  alt={p.name}
                  width={160}
                  height={160}
                  className="h-full w-auto max-w-[120px] object-contain"
                />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm text-(--kbms-ink)">{p.name}</p>
                <p className="font-body mt-1 text-[11px] uppercase tracking-[0.08em] text-(--kbms-ink-soft)">
                  {p.tagline}
                </p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
