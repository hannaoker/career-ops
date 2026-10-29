/** @type {import('next').NextConfig} */
const nextConfig = {
  // Two lockfiles exist on purpose (repo root + web/), so Next would infer the
  // repo root as the workspace root. On Windows that misinference can send
  // Turbopack's postcss workers into an unbounded respawn loop that exhausts
  // all RAM (vercel/next.js#92978) — pin the root to this app.
  turbopack: { root: import.meta.dirname },
  // Allow a throwaway build dir (e.g. BUILD_DIST=.next-prod) so a production
  // `next build` can run without clobbering a live `next dev` .next.
  ...(process.env.BUILD_DIST ? { distDir: process.env.BUILD_DIST } : {}),
  // Let `next dev` serve its client assets to the hosts already trusted by the
  // API guard (CAREER_OPS_WEB_ALLOWED_HOSTS, e.g. a Tailscale address).
  allowedDevOrigins: (process.env.CAREER_OPS_WEB_ALLOWED_HOSTS ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim().replace(/:\d+$/, ""))
    .filter(Boolean),
};

export default nextConfig;
