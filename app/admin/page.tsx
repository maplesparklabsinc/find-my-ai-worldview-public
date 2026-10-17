// /admin, Overview (issue #14; split from Research checks in the PR #65 review):
// what's coming in, read first. proxy.ts asks for ADMIN_PASSWORD and returns
// 404 when it isn't set; the page checks again. Aggregates only, read on the
// server on every request. Copy here is founder-facing UI, not public site copy.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminHeader } from "@/components/admin-header";
import { EarlyNote, Feedback, Location, Outcomes, PerDay, SharingCard, Themes, Tile } from "@/components/admin-cards";
import { FEW, buildDashboard, countOf, plural } from "@/lib/admin";
import { adminPassword } from "@/lib/admin/gate";
import { guessMatch, guessSummary } from "@/lib/admin/guess";
import { alsoBetweenWith, betweenPairs, flaggedTile, location, qualityByRow, sharing, themeSpread } from "@/lib/admin/insights";
import { contentVersions, getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { readAdmin, readAdminRows, readLocation, readSharing } from "@/lib/db/admin";

export const metadata: Metadata = {
  title: "Admin: overview",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="px-4 pb-16 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-[75rem] flex-col gap-8">
        <Suspense fallback={<p className="pt-6 text-ink-muted">Loading…</p>}>
          <Overview />
        </Suspense>
      </div>
    </div>
  );
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

async function Overview() {
  await connection();
  if (!adminPassword()) notFound();
  const content = getContent();
  const copy = getCopy();
  const versions = contentVersions(content);
  const [raw, rows, loc, share] = await Promise.all([readAdmin(versions), readAdminRows(versions), readLocation(), readSharing()]);
  const d = buildDashboard(raw, content, copy, versions);
  const early = rows.length < FEW;
  const flagged = flaggedTile(qualityByRow(content, rows));
  const also = alsoBetweenWith(content, rows);
  const names = new Map(content.perspectives.perspectives.map((p) => [p.name, p.id]));
  const guess = guessSummary(
    rows.map((r) => guessMatch({ ...r, first: r.ranked[0]?.id ?? null, second: r.ranked[1]?.id ?? null })),
  );
  const updated = new Date().toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

  return (
    <>
      <AdminHeader current="/admin">
        <span>Live content {d.versions}</span>
        <span>Updated {updated} UTC</span>
        <a href="/admin" className="inline-flex min-h-11 items-center font-semibold">
          Refresh
        </a>
      </AdminHeader>

      <main className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[2rem] leading-10 font-bold">What&apos;s coming in</h1>
          <p className="max-w-[47.5rem] text-base text-ink-muted">
            Everyone here chose to take the quiz, so these numbers describe them, not any population. Days are UTC.
            {early ? "" : " Groups with fewer than 30 people are marked; read them lightly."}
          </p>
          {early && <EarlyNote />}
          <p className="text-base">
            <Link href="/admin/research">Research checks</Link> has the method and question checks.{" "}
            <Link href="/admin/responses">Single responses</Link> are listed without email addresses.
          </p>
        </div>

        <section aria-label="Totals" className="flex flex-col gap-3">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12.5rem),1fr))] gap-3">
            <Tile label="Today" value={d.totals.today} note={plural(d.totals.today, "completed quiz", "completed quizzes")} />
            <Tile label="Last 7 days" value={d.totals.week} note={plural(d.totals.week, "completed quiz", "completed quizzes")} />
            <Tile label="All time" value={d.totals.allTime} note={plural(d.totals.allTime, "completed quiz", "completed quizzes")} />
            <Tile
              label="Research sign-ups"
              value={d.totals.research}
              note={`active · ${d.totals.researchShare} of completions · emails stay in Supabase`}
              href="/admin/responses?research=yes"
            />
            <Tile
              label="Flagged for a look"
              value={flagged.n}
              note={`${flagged.pct} of current content. Rushed or the same answer throughout. See the list.`}
              href="/admin/responses?check=flagged"
            />
          </div>
          <p className="text-base">
            {guess.guessed === 0 ? (
              "Guessed their result: no guesses yet on current content."
            ) : (
              <>
                Guessed their result: <span className="font-bold">{pct(guess.yes, guess.guessed)}</span> of those who guessed (
                {countOf(guess.guessed, "person", "people")}); close: {pct(guess.close, guess.guessed)}.
              </>
            )}
          </p>
        </section>

        <Feedback d={d} />
        <Outcomes d={d} pairs={betweenPairs(content, rows)} also={(name) => also.get(names.get(name) ?? "") ?? ""} early={early} />
        <Themes themes={themeSpread(content, rows)} early={early} />
        <PerDay d={d} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,28.75rem),1fr))] items-start gap-6">
          <Location rows={location(content, loc)} />
          <SharingCard s={sharing(share)} />
        </div>
      </main>

      <p className="max-w-[47.5rem] text-sm text-ink-muted">
        Read only. No single person&apos;s answers are shown on this page (Responses has them), and no email addresses,
        including any typed into feedback. Replying to feedback isn&apos;t set up yet.
        Older content versions are counted in the totals, per day, location and sharing, but left out of the rest.
      </p>
    </>
  );
}
