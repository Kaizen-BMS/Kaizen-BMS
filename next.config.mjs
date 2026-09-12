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
  // reactCompiler DISABLED 2026-09-12 — deployment builds crash prerendering
  // Next's own internal /_global-error page ("Cannot read properties of
  // null (reading 'useContext')"), traced into Next's built-in
  // DefaultGlobalError component (node_modules/next/dist/.../global-error.js),
  // not this app's code (no custom global-error.js exists here, and there
  // is no createContext() anywhere in src/). Neither `experimental.cpus: 1`
  // (ruling out a build-worker race — vercel/next.js#86178/#95741) nor
  // bumping to the latest stable Next 16.3.5 fixed it on the deploy
  // platform, despite this machine never reproducing the crash either way
  // to verify locally. React Compiler is the one remaining experimental,
  // removable setting most likely to interact badly with framework-internal
  // rendering — trying with it off next. If this ALSO doesn't fix the real
  // deploy, the documented last-resort fallback is pinning back to Next
  // 15.5.6, confirmed by the community not to have this regression (see
  // CLAUDE.md "Deployment gotchas").
  // reactCompiler: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
