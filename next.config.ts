import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Content Security Policy (issue #18). Everything is served from this origin:
// fonts are self-hosted by next/font, and Vercel Web Analytics loads and posts
// under /_vercel/insights. Scripts need 'unsafe-inline' because the App Router
// streams inline scripts and pages are prerendered, so a per-request nonce
// isn't possible. The dev server also needs eval, websockets for reloads, and
// the debug analytics script.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Metadata is resolved before any HTML is sent, for every user agent, not just
  // link previewers. So a notFound() in generateMetadata (a missing /r/{id} or
  // /c/{id}) is a real 404 in browsers too, instead of a streamed not-found page
  // with a 200 (issue #21). Every other page's metadata is static.
  htmlLimitedBots: /.*/,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // `npm run dev:lan` serves the dev server to phones on the same Wi-Fi. The dev
  // server only accepts its dev assets from hosts it knows, so allow the private
  // network ranges a home or office router hands out (and .local names).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
