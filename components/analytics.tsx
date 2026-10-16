"use client";

// Vercel Web Analytics: cookieless page views and the funnel events in
// lib/analytics.ts. Result and compare IDs are removed from page URLs, and query
// strings are dropped, so no view can be tied to a stored response. Nothing is
// sent from /admin.
import { Analytics as VercelAnalytics, type BeforeSendEvent } from "@vercel/analytics/next";

export function scrub(url: string): string {
  const u = new URL(url);
  u.search = "";
  u.hash = "";
  u.pathname = u.pathname.replace(/^\/(r|c)\/[^/]+/, "/$1/[id]");
  return u.toString();
}

export function isAdmin(url: string): boolean {
  return /^\/admin(\/|$)/.test(new URL(url).pathname);
}

export function Analytics() {
  return <VercelAnalytics beforeSend={(e: BeforeSendEvent) => (isAdmin(e.url) ? null : { ...e, url: scrub(e.url) })} />;
}
