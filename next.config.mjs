/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig = {
  reactCompiler: true,
  // Forces single-worker static generation. Works around a known Next.js
  // 16.x bug (vercel/next.js#86178, #95741) where prerendering the
  // framework's internal /_global-error page crashes with
  // "Cannot read properties of null (reading 'useContext')" under worker
  // parallelism — a race condition in Next's own build-worker scheduling,
  // not application code (reproduces even with global-error.tsx removed
  // entirely). Costs some build time, not runtime performance.
  experimental: {
    cpus: 1,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
