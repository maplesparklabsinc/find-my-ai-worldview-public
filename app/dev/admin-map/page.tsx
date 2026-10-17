// Test harness for the admin world map (issue #84): the Location card with
// made-up numbers, so it can be checked without a database. Not a real screen.
// Hidden in production unless ENABLE_DEV_PAGE=1 (the Playwright server sets it).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Location, PerDay } from "@/components/admin-cards";
import { buildDashboard, type AdminRaw } from "@/lib/admin";
import { location, worldMap } from "@/lib/admin/insights";
import { contentVersions, getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";

export const metadata: Metadata = {
  title: "Dev: admin world map",
  robots: { index: false, follow: false },
};

// The counts from the design boards.
const MADE_UP: Record<string, [number, number]> = {
  Canada: [31, 9],
  "United States": [24, 6],
  "Latin America": [4, 1],
  "United Kingdom": [5, 2],
  "Elsewhere in Europe": [9, 3],
  "Middle East": [1, 0],
  Africa: [1, 0],
  "South Asia": [7, 2],
  "East and Southeast Asia": [6, 1],
  "Australia or New Zealand": [3, 1],
  "Somewhere else": [2, 0],
};

export default function DevAdminMap() {
  return (
    <Suspense fallback={<p className="p-6 text-ink-muted">Loading…</p>}>
      <Cards />
    </Suspense>
  );
}

async function Cards() {
  await connection();
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_PAGE !== "1") notFound();
  const content = getContent();
  const version = content.items.item_bank_version;
  const options = content.itemsById.get("D11")!.options;
  const answers = [
    ...Object.entries(MADE_UP).map(([label, [all, week]]) => ({ item_bank_version: version, option: options.indexOf(label), all_time: all, last_7_days: week })),
    { item_bank_version: version, option: null, all_time: 4, last_7_days: 1 },
  ];
  const rows = location(content, answers);
  const today = "2026-10-17";
  const daily = Array.from({ length: 30 }, (_, i) => ({
    day: new Date(Date.parse(today) - i * 86_400_000).toISOString().slice(0, 10),
    n: [1, 1, 2, 3, 1, 4, 1, 2, 0, 3][i % 10] + (i === 1 ? 10 : 0),
  }));
  const raw: AdminRaw = {
    today,
    totals: { today: 1, last_7_days: 25, all_time: 97 },
    research_active: 0,
    daily,
    outcomes: [],
    rules_depend: [],
    tracks: [],
    skips: [],
    changes: [],
    feedback: [],
    feedback_last_7_days: 0,
    feedback_total: 0,
  };
  const d = buildDashboard(raw, content, getCopy(), contentVersions(content));
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-10">
      <main className="mx-auto grid w-full max-w-[75rem] grid-cols-[repeat(auto-fit,minmax(min(100%,28.75rem),1fr))] items-start gap-6">
        <h1 className="sr-only">Admin world map</h1>
        <PerDay d={d} />
        <Location rows={rows} map={worldMap(rows)} />
      </main>
    </div>
  );
}
