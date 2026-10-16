// /admin (issue #14): a private, read-only view of what's coming in. proxy.ts
// asks for ADMIN_PASSWORD and returns 404 when it isn't set; the page checks
// again. Aggregates only, read on the server on every request. Copy here is
// founder-facing UI, not public site copy.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { AdminHeader } from "@/components/admin-header";
import { adminPassword } from "@/lib/admin/gate";
import { buildDashboard, countOf, niceMax, plural, type Dashboard } from "@/lib/admin";
import { contentVersions, getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { readAdmin } from "@/lib/db/admin";

export const metadata: Metadata = {
  title: "Admin: what's coming in",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="px-4 pb-16 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-[75rem] flex-col gap-8">
        <Suspense fallback={<p className="pt-6 text-ink-muted">Loading…</p>}>
          <Admin />
        </Suspense>
      </div>
    </div>
  );
}

async function Admin() {
  await connection();
  if (!adminPassword()) notFound();
  const content = getContent();
  const versions = contentVersions(content);
  const d = buildDashboard(await readAdmin(versions), content, getCopy(), versions);
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
            Groups with fewer than 30 people are marked; read them lightly.
          </p>
          <p className="text-base">
            <Link href="/admin/responses">Look at single responses</Link>, without emails or free text.
          </p>
        </div>

        <section aria-label="Totals" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12.5rem),1fr))] gap-3">
          <Tile label="Today" value={d.totals.today} note={plural(d.totals.today, "completed quiz", "completed quizzes")} />
          <Tile label="Last 7 days" value={d.totals.week} note={plural(d.totals.week, "completed quiz", "completed quizzes")} />
          <Tile label="All time" value={d.totals.allTime} note={plural(d.totals.allTime, "completed quiz", "completed quizzes")} />
          <Tile
            label="Research sign-ups"
            value={d.totals.research}
            note={`${d.totals.researchShare} of completions · emails stay in Supabase`}
          />
        </section>

        <PerDay d={d} />

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,28.75rem),1fr))] items-start gap-6">
          <Outcomes d={d} />
          <Fit d={d} />
          <RulesDepend d={d} />
          <Tracks d={d} />
          <Questions d={d} />
        </div>

        <Feedback d={d} />
      </main>

      <p className="max-w-[47.5rem] text-sm text-ink-muted">
        Read only. No single person&apos;s answers are shown on this page (Responses has them, without emails or free
        text), and no email addresses: to reply to feedback or reach research sign-ups, use the Supabase dashboard. Older content versions are counted in the totals and per day, but
        left out of the tables above.
      </p>
    </>
  );
}

const fmt = new Intl.NumberFormat("en-CA");

function Tile({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-raised p-5">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-4xl leading-11 font-bold tabular-nums">{fmt.format(value)}</span>
      <span className="text-sm text-ink-muted">{note}</span>
    </div>
  );
}

function Card({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-surface-raised p-4 text-base sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="text-[1.375rem] leading-7 font-bold">
          {title}
        </h2>
        {aside && <span className="text-sm text-ink-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>;
}

function NothingYet() {
  return <p className="text-ink-muted">Nothing yet.</p>;
}

/** Tables scroll in their own box at phone width. Focusable so keyboard users can scroll it. */
function TableBox({ label, min = "", children }: { label: string; min?: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto">
      <table className={`w-full border-collapse text-base ${min} [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:align-top [&_th]:text-sm [&_th]:font-semibold [&_th]:text-ink-muted`}>
        {children}
      </table>
    </div>
  );
}

const num = "text-right tabular-nums";
/** Flagged values: colour and bold, never colour alone. */
const flagged = (on: boolean) => (on ? "font-bold text-second" : "");

function Few() {
  return <span className="block text-[0.8125rem] leading-4 text-second">under 30, read lightly</span>;
}

function PerDay({ d }: { d: Dashboard }) {
  const max = niceMax(d.dayMax);
  const first = d.days[0];
  const mid = d.days[Math.floor(d.days.length / 2)];
  const last = d.days[d.days.length - 1];
  return (
    <Card id="perday" title="Completions per day" aside={`Last 30 days${d.peak ? ` · busiest ${d.peak}` : ""}`}>
      <div role="img" aria-label={d.daySummary} className="flex items-stretch gap-3">
        <div aria-hidden="true" className="flex flex-col justify-between pb-[1.375rem] text-right text-[0.8125rem] leading-4 text-ink-muted tabular-nums">
          <span>{fmt.format(max)}</span>
          <span>{fmt.format(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="relative flex h-45 items-end gap-0.5 border-b border-line-strong">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
            <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
            {d.days.map((day) => (
              <div
                key={day.date}
                title={`${day.label}: ${fmt.format(day.n)}${day.today ? " so far today" : ""}`}
                className={`relative min-w-0 flex-1 rounded-t-sm ${day.today ? "bg-accent/45" : "bg-accent"}`}
                style={{ height: `${(day.n / max) * 100}%` }}
              />
            ))}
          </div>
          <div aria-hidden="true" className="flex justify-between text-[0.8125rem] leading-4 text-ink-muted">
            <span>{first.label}</span>
            <span>{mid.label}</span>
            <span>{last.label}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Outcomes({ d }: { d: Dashboard }) {
  return (
    <Card id="results" title="Results people got">
      <Note>
        All time, current content only{d.outcomesTotal > 0 ? ` (${countOf(d.outcomesTotal, "person", "people")})` : ""}. A healthy
        mix matters more than any one number.
      </Note>
      <TableBox label="Results people got">
        <thead>
          <tr>
            <th scope="col">Result</th>
            <th scope="col" className="text-right!">
              People
            </th>
            <th scope="col" className="w-[45%]">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {d.outcomes.map((o) => (
            <tr key={o.name}>
              <td className={o.named ? "font-semibold" : "text-ink-muted italic"}>{o.name}</td>
              <td className={num}>{fmt.format(o.n)}</td>
              <td>
                <div className="flex items-center gap-2">
                  <div aria-hidden="true" className="h-2.5 flex-1 rounded-pill bg-accent-soft">
                    <div className="h-2.5 rounded-pill bg-accent" style={{ width: `${o.width * 100}%` }} />
                  </div>
                  <span className="w-10 text-right tabular-nums">{o.pct}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </TableBox>
    </Card>
  );
}

function Fit({ d }: { d: Dashboard }) {
  return (
    <Card id="fit" title="Does the result fit?">
      <Note>From &quot;Does this fit you?&quot; on the result page, by the perspective people were given. &quot;Other results&quot; covers In between, Your own combination, Still forming and Not a priority.</Note>
      {d.fit.length === 0 ? (
        <NothingYet />
      ) : (
        <TableBox label="Does the result fit?" min="min-w-[30rem]">
          <thead>
            <tr>
              <th scope="col">Given</th>
              <th scope="col" className="text-right!">
                Rated
              </th>
              <th scope="col" className="text-right!">
                Fits well
              </th>
              <th scope="col" className="text-right!">
                Doesn&apos;t fit
              </th>
              <th scope="col">If not, picked</th>
            </tr>
          </thead>
          <tbody>
            {d.fit.map((f) => (
              <tr key={f.name}>
                <td>
                  {f.name}
                  {f.few && <Few />}
                </td>
                <td className={num}>{fmt.format(f.n)}</td>
                <td className={num}>{f.well}</td>
                <td className={`${num} ${flagged(f.poorFlag)}`}>{f.poor}</td>
                <td className="text-ink-muted">{f.picked}</td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      )}
      <Note>
        Fits well = &quot;Very well&quot; or &quot;Extremely well&quot;. Doesn&apos;t fit = &quot;Not at all&quot; or &quot;A
        little&quot;. Over 30% doesn&apos;t fit is in bold.
      </Note>
    </Card>
  );
}

function RulesDepend({ d }: { d: Dashboard }) {
  return (
    <Card id="rules-low-risk" title="Rules for low-risk AI">
      <Note>
        From the question asking whether low-risk uses of AI should be left mostly alone or meet a basic set of public rules
        (CX-T1), by result.
        Collected, not scored: it doesn&apos;t change anyone&apos;s result.
      </Note>
      {d.rulesDepend.length === 0 ? (
        <NothingYet />
      ) : (
        <TableBox label="Rules for low-risk AI" min="min-w-[26rem]">
          <thead>
            <tr>
              <th scope="col">Result</th>
              <th scope="col" className="text-right!">
                Answered
              </th>
              <th scope="col" className="text-right!">
                Leave low-risk alone
              </th>
              <th scope="col" className="text-right!">
                Strongly
              </th>
            </tr>
          </thead>
          <tbody>
            {d.rulesDepend.map((r) => (
              <tr key={r.name}>
                <td className={r.named ? "" : "text-ink-muted italic"}>
                  {r.name}
                  {r.few && <Few />}
                </td>
                <td className={num}>{fmt.format(r.n)}</td>
                <td className={num}>{r.depends}</td>
                <td className={num}>{r.strongly}</td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      )}
      <Note>
        Leave low-risk alone = picked &quot;Low-risk uses of AI should be left mostly alone&quot;, slightly or strongly.
        Shares are of those who answered. Matched results are counted under their closest perspective.
      </Note>
      <Note>Item bank 0.7.0 and later (the wording changed in 0.7.0).</Note>
    </Card>
  );
}

function Tracks({ d }: { d: Dashboard }) {
  return (
    <Card id="checks" title="Where people say we placed them wrong">
      <Note>From &quot;Check your six answers&quot;. A lopsided row means that question&apos;s scoring may lean. Over 30% to one side is in bold.</Note>
      {d.tracks.length === 0 ? (
        <NothingYet />
      ) : (
        <TableBox label="Where people say we placed them wrong" min="min-w-[30rem]">
          <thead>
            <tr>
              <th scope="col">Question</th>
              <th scope="col" className="text-right!">
                Checked
              </th>
              <th scope="col" className="text-right!">
                About right
              </th>
              <th scope="col" className="text-right!">
                Further left
              </th>
              <th scope="col" className="text-right!">
                Further right
              </th>
            </tr>
          </thead>
          <tbody>
            {d.tracks.map((t) => (
              <tr key={t.question}>
                <td>
                  {t.question}
                  <span className="block text-[0.8125rem] leading-4 text-ink-muted">
                    left: {t.low} · right: {t.high}
                  </span>
                  {t.few && <Few />}
                </td>
                <td className={num}>{fmt.format(t.n)}</td>
                <td className={num}>{t.ok}</td>
                <td className={`${num} ${flagged(t.lowFlag)}`}>{t.further_low}</td>
                <td className={`${num} ${flagged(t.highFlag)}`}>{t.further_high}</td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      )}
    </Card>
  );
}

function ItemList({ rows }: { rows: Dashboard["skipped"] }) {
  if (rows.length === 0) return <NothingYet />;
  return (
    <ol className="flex flex-col">
      {rows.map((s) => (
        <li key={s.id} className="flex gap-3 border-b border-line py-2.5">
          <span className="w-14 flex-none font-semibold text-ink-muted">{s.id}</span>
          <span className="min-w-0 flex-1">{s.text}</span>
          <span className="flex-none tabular-nums">{s.value}</span>
        </li>
      ))}
    </ol>
  );
}

function Questions({ d }: { d: Dashboard }) {
  return (
    <Card id="questions" title="Questions to look at">
      <Note>Skipped a lot, or answered and then changed: both can mean a statement is unclear. Current question set only.</Note>
      <h3 className="mt-2 text-[1.0625rem] leading-6 font-bold">Most skipped</h3>
      <ItemList rows={d.skipped} />
      <h3 className="mt-2 text-[1.0625rem] leading-6 font-bold">Most changed after going back</h3>
      <ItemList rows={d.changed} />
    </Card>
  );
}

function Feedback({ d }: { d: Dashboard }) {
  return (
    <Card
      id="feedback"
      title="Feedback"
      aside={`Newest first · ${fmt.format(d.feedbackWeek)} in the last 7 days${d.feedback.length === 20 ? " · showing the latest 20" : ""}`}
    >
      {d.feedback.length === 0 ? (
        <NothingYet />
      ) : (
        <TableBox label="Feedback" min="min-w-[47.5rem]">
          <thead>
            <tr>
              <th scope="col" className="w-20">
                Date
              </th>
              <th scope="col" className="w-52">
                Problem
              </th>
              <th scope="col" className="min-w-64">
                What they said
              </th>
              <th scope="col" className="w-24">
                Can quote
              </th>
              <th scope="col" className="w-30">
                Reply
              </th>
            </tr>
          </thead>
          <tbody>
            {d.feedback.map((m, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap text-ink-muted">{m.date}</td>
                <td>
                  {m.type}
                  {m.about && <span className="block text-[0.8125rem] leading-4 text-ink-muted">{m.about}</span>}
                </td>
                <td className="break-words whitespace-pre-line">
                  {m.body}
                  {m.result && (
                    <a href={m.result} className="mt-1 block text-sm font-semibold">
                      {m.resultLabel}
                    </a>
                  )}
                </td>
                <td>{m.quote}</td>
                <td className="text-ink-muted">{m.reply}</td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      )}
    </Card>
  );
}
