"use client";

// A person's photo, or their initials when there is none.
export default function Avatar({ name, src, size = 36, onClick, title }) {
  const initials = (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.36) };
  const cls = `grid shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--hms-accent-soft)] font-semibold text-[var(--hms-accent)] ${onClick ? "cursor-pointer" : ""}`;
  return (
    <span onClick={onClick} title={title} className={cls} style={style}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name || ""} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}
