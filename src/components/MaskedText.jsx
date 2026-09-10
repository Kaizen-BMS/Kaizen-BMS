"use client";

import { motion } from "framer-motion";

const container = {
  hidden: {},
  visible: (stagger) => ({
    transition: { staggerChildren: stagger },
  }),
};

const word = {
  hidden: { y: "110%" },
  visible: {
    y: "0%",
    transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
  },
};

/**
 * Masked word-reveal for headlines: each word sits in its own overflow-hidden
 * mask and rises into place with a stagger — distinct from the generic
 * fade-in-up treatment used for body content elsewhere on the page.
 *
 * The viewport trigger lives on the outer, untransformed wrapper and is
 * propagated to each word via variants. Watching the transformed word
 * directly would break: IntersectionObserver clips a target's intersection
 * rect against every ancestor's overflow, so a word translated out of its
 * own overflow-hidden mask reads as permanently "not intersecting" and its
 * whileInView would never fire.
 */
export default function MaskedText({
  text,
  as: Tag = "span",
  className = "",
  delay = 0,
  stagger = 0.06,
  once = true,
}) {
  const words = text.split(" ");
  const MotionTag = motion[Tag] ?? motion.span;

  return (
    <MotionTag
      className={className}
      custom={stagger}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "0px 0px -10% 0px" }}
      transition={{ delayChildren: delay }}
    >
      {words.map((w, i) => (
        <span
          key={i}
          className="inline-block overflow-hidden align-bottom pb-[0.08em]"
        >
          <motion.span className="inline-block" variants={word}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </MotionTag>
  );
}
