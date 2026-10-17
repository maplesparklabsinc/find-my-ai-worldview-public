// The cards on the two dashboard tabs, Overview (/admin) and Research checks
// (/admin/research). Server components; they render what lib/admin works out.
// `early` is true while current content has fewer than FEW responses: the page
// then shows one early-data note, and the per-row "read lightly" tags are hidden.
// Copy here is founder-facing UI, not public site copy.
import type { ReactNode } from "react";
import { countOf, niceMax, type Dashboard } from "@/lib/admin";
import {
  HEALTH_FIRST_ROWS,
  worstBothAgree,
  type BetweenPair,
  type BothAgree,
  type FitRow,
  type HealthSort,
  type LocationRow,
  type SetupLine,
  type Sharing,
  type StatementHealth,
  type ThemeSpread,
} from "@/lib/admin/insights";

const fmt = new Intl.NumberFormat("en-CA");

export function Tile({ label, value, note, href }: { label: string; value: number; note: string; href?: string }) {
  const inner = (
    <>
      <span className={`text-sm text-ink-muted${href ? " underline" : ""}`}>{label}</span>
      <span className="text-4xl leading-11 font-bold tabular-nums">{fmt.format(value)}</span>
      <span className="text-sm text-ink-muted">{note}</span>
    </>
  );
  const box = "flex flex-col gap-1 rounded-md border border-line bg-surface-raised p-5";
  return href ? (
    <a href={href} className={`${box} text-ink no-underline hover:border-line-strong`}>
      {inner}
    </a>
  ) : (
    <div className={box}>{inner}</div>
  );
}

export function Card({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
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

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>;
}

export function NothingYet() {
  return <p className="text-ink-muted">Nothing yet.</p>;
}

/** Tables scroll in their own box at phone width. Focusable so keyboard users can scroll it. */
export function TableBox({ label, min = "", children }: { label: string; min?: string; children: ReactNode }) {
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

export function Few() {
  return <span className="block text-[0.8125rem] leading-4 text-second">under 30, read lightly</span>;
}

export function PerDay({ d }: { d: Dashboard }) {
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

export function Outcomes({ d, pairs, also, early }: { d: Dashboard; pairs: BetweenPair[]; also: (name: string) => string; early: boolean }) {
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
              <td className={o.named ? "font-semibold" : "text-ink-muted italic"}>
                {o.name}
                {o.named && also(o.name) && (
                  <span className="block text-[0.8125rem] leading-4 font-normal text-ink-muted">Also in between with: {also(o.name)}</span>
                )}
              </td>
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
      {pairs.length > 0 && (
        <details className="flex flex-col gap-2">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold">Show the In between pairs</summary>
          <TableBox label="In between pairs">
            <thead>
              <tr>
                <th scope="col">Between</th>
                <th scope="col" className="text-right!">
                  People
                </th>
                <th scope="col" className="text-right!">
                  Of In between
                </th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p) => (
                <tr key={p.key}>
                  <td>
                    <a href={`/admin/responses?result=${encodeURIComponent(`between:${p.key}`)}`}>{p.label}</a>
                    {p.few && !early && <Few />}
                  </td>
                  <td className={num}>{fmt.format(p.n)}</td>
                  <td className={num}>{p.pct}</td>
                </tr>
              ))}
            </tbody>
          </TableBox>
        </details>
      )}
    </Card>
  );
}

export function RulesDepend({ d, early }: { d: Dashboard; early: boolean }) {
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
                  {r.few && !early && <Few />}
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

export function Tracks({ d, early }: { d: Dashboard; early: boolean }) {
  return (
    <Card id="checks" title="Where people say we placed them wrong">
      <Note>From &quot;Check your six answers&quot;. A lopsided row means that question&apos;s scoring may lean. Over 30% to one side is in bold once 30 people have checked.</Note>
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
                  {t.few && !early && <Few />}
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

export function ItemList({ rows }: { rows: Dashboard["skipped"] }) {
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

export function Questions({ d }: { d: Dashboard }) {
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

export function Feedback({ d }: { d: Dashboard }) {
  return (
    <Card
      id="feedback"
      title="Feedback"
      aside={`${fmt.format(d.feedbackTotal)} in all · ${fmt.format(d.feedbackWeek)} in the last 7 days · newest first${d.feedback.length === 20 ? ", the latest 20" : ""}`}
    >
      {d.feedback.length === 0 ? (
        <NothingYet />
      ) : (
        <>
          {/* Phones: one entry per item, so what they said is readable without scrolling sideways. */}
          <ul className="flex flex-col sm:hidden" aria-label="Feedback">
            {d.feedback.map((m, i) => (
              <li key={i} className="flex flex-col gap-1 border-b border-line py-3">
                <p className="text-sm text-ink-muted">
                  {m.date} · <span className="font-semibold text-ink">{m.type}</span>
                  {m.about && <> · {m.about}</>}
                </p>
                <p className="break-words whitespace-pre-line">{m.body}</p>
                {m.result && (
                  <a href={m.result} className="text-sm font-semibold">
                    {m.resultLabel}
                  </a>
                )}
                <p className="text-[0.8125rem] leading-4 text-ink-muted">
                  Can quote: {m.quote} · Reply: {m.reply}
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
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
          </div>
        </>
      )}
    </Card>
  );
}

/** Small bars for a spread of counts, hidden from screen readers; the caller gives the words. */
export function Spark({ counts, label }: { counts: number[]; label: string }) {
  const max = Math.max(1, ...counts);
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span aria-hidden="true" className="flex h-6 items-end gap-0.5">
        {counts.map((n, i) => (
          <span key={i} className="w-2 rounded-t-[1px] bg-accent" style={{ height: `${Math.max(n > 0 ? 8 : 2, (n / max) * 100)}%`, opacity: n > 0 ? 1 : 0.35 }} />
        ))}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Fit({ rows, early }: { rows: FitRow[]; early: boolean }) {
  return (
    <Card id="fit" title="Does the result fit?">
      <Note>
        From &quot;Does this fit you?&quot; and &quot;Which fits you better?&quot; on the result page, by the result people were
        given. In between is also broken down by pair. How clear the result was: how far ahead the closest perspective was
        of the next one.
      </Note>
      {rows.length === 0 ? (
        <NothingYet />
      ) : (
        <TableBox label="Does the result fit?" min="min-w-[44rem]">
          <thead>
            <tr>
              <th scope="col">Given</th>
              <th scope="col" className="text-right!">
                Rated
              </th>
              <th scope="col">Ratings, 1 to 5</th>
              <th scope="col" className="text-right!">
                Fits well
              </th>
              <th scope="col" className="text-right!">
                Doesn&apos;t fit
              </th>
              <th scope="col">Picked instead</th>
              <th scope="col">How clear the result was</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={`${f.sub}-${f.name}`}>
                <td className={f.sub ? "pl-7! text-ink-muted" : ""}>
                  {f.name}
                  {f.few && !early && <Few />}
                </td>
                <td className={num}>{fmt.format(f.n)}</td>
                <td>
                  <Spark counts={f.spread} label={f.summary} />
                </td>
                <td className={num}>{f.well}</td>
                <td className={`${num} ${flagged(f.poorFlag)}`}>{f.poor}</td>
                <td className="text-ink-muted">{f.picked}</td>
                <td className="whitespace-nowrap">
                  {f.clarity ? (
                    <>
                      {f.clarity.words}
                      <span className="block text-[0.8125rem] leading-4 text-ink-muted">{f.clarity.counts}</span>
                    </>
                  ) : (
                    "–"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      )}
      <Note>
        Fits well = &quot;Very well&quot; or &quot;Extremely well&quot;. Doesn&apos;t fit = &quot;Not at all&quot; or &quot;A
        little&quot;; over 30% is in bold once 30 people have rated. Very close means the runner-up was within the margin
        that makes a result In between.
      </Note>
    </Card>
  );
}

export function Location({ rows }: { rows: LocationRow[] }) {
  return (
    <Card id="location" title="Where people live">
      <Note>From &quot;Where do you currently live?&quot;, as people answered it. All content versions, each answer under the option it had then. Never looked up from an address.</Note>
      <TableBox label="Where people live">
        <thead>
          <tr>
            <th scope="col">Answer</th>
            <th scope="col" className="text-right!">
              All time
            </th>
            <th scope="col" className="text-right!">
              Share
            </th>
            <th scope="col" className="text-right!">
              Last 7 days
            </th>
            <th scope="col" className="text-right!">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className={r.label === "Not answered" ? "text-ink-muted italic" : ""}>{r.label}</td>
              <td className={num}>{fmt.format(r.allTime)}</td>
              <td className={num}>{r.allPct}</td>
              <td className={num}>{fmt.format(r.week)}</td>
              <td className={num}>{r.weekPct}</td>
            </tr>
          ))}
        </tbody>
      </TableBox>
    </Card>
  );
}

export function SharingCard({ s }: { s: Sharing }) {
  return (
    <Card id="sharing" title="Sharing">
      <Note>From compare links only. We don&apos;t track where visitors came from. All content versions.</Note>
      <ul className="flex flex-col gap-1">
        <li>
          Came from a compare link: {countOf(s.compared, "response", "responses")} ({s.comparedPct} of all)
        </li>
        <li>Compared with: {countOf(s.targets, "different person", "different people")}</li>
      </ul>
      <h3 className="mt-2 text-[1.0625rem] leading-6 font-bold">Most compared with</h3>
      {s.top.length === 0 ? (
        <NothingYet />
      ) : (
        <ol className="flex flex-col">
          {s.top.map((t) => (
            <li key={t.id} className="flex gap-3 border-b border-line py-2.5">
              <a href={`/admin/responses/${t.id}`} className="min-w-0 flex-1 font-mono text-sm">
                {t.id}
              </a>
              <span className="flex-none tabular-nums">{countOf(t.n, "comparison", "comparisons")}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function Setup({ lines }: { lines: SetupLine[] }) {
  return (
    <Card id="setup" title="Research setup check">
      <Note>Confirms the method is working as designed, on current content. Shares are judged once there are 30 responses.</Note>
      <ul className="flex flex-col">
        {lines.map((l) => (
          <li key={l.label} className="flex flex-wrap items-baseline gap-x-3 border-b border-line py-2.5">
            <span className="min-w-0 flex-1">
              {l.label}
              <span className="block text-[0.8125rem] leading-4 text-ink-muted">{l.note}</span>
            </span>
            <span className="tabular-nums">{l.value}</span>
            <span className={`w-28 text-right font-semibold ${l.ok === false ? "text-second" : "text-ink-muted"}`}>
              {l.ok === null ? "Too few yet" : l.ok ? "OK" : "Look"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Themes({ themes, early }: { themes: ThemeSpread[]; early: boolean }) {
  return (
    <Card id="themes" title="How people spread across each theme">
      <Note>
        How many people are in each band, from one end to the other, on current content. Counts across people only: no
        averages and no one&apos;s score.
      </Note>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-x-8 gap-y-6">
        {themes.map((t) => (
          <figure key={t.construct} className="flex min-w-0 flex-col gap-2">
            <figcaption className="font-semibold">
              {t.name}
              <span className="block text-sm font-normal text-ink-muted">
                {countOf(t.n, "person", "people")} placed{t.notPlaced > 0 ? `, ${fmt.format(t.notPlaced)} not placed` : ""}
              </span>
              {t.few && !early && <Few />}
            </figcaption>
            <div role="img" aria-label={t.summary} className="flex flex-col gap-1">
              <div aria-hidden="true" className="flex h-16 items-end gap-1 border-b border-line-strong">
                {t.bands.map((b) => (
                  <div key={b.band} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
                    <span className="text-[0.8125rem] leading-4 tabular-nums text-ink-muted">{b.n}</span>
                    <div className="w-full rounded-t-sm bg-accent" style={{ height: `${Math.max(b.n > 0 ? 6 : 1, b.width * 44)}px` }} />
                  </div>
                ))}
              </div>
              <div aria-hidden="true" className="flex justify-between gap-4 text-[0.8125rem] leading-4 text-ink-muted">
                <span>{t.low}</span>
                <span className="text-right">{t.high}</span>
              </div>
            </div>
          </figure>
        ))}
      </div>
    </Card>
  );
}

const SORT_LABELS: Record<HealthSort, string> = {
  item: "Statement",
  answered: "Answered",
  skip: "Skipped",
  changed: "Changed",
  side: "Most on one side",
};

const SIDE_NOTE = "Share who agreed or disagreed, whichever is larger";

export function Health({ rows, pairs, sort, all, early }: { rows: StatementHealth[]; pairs: BothAgree[]; sort: HealthSort; all: boolean; early: boolean }) {
  const head = (key: HealthSort, right = true) => (
    <th scope="col" aria-sort={sort === key ? (key === "item" ? "ascending" : "descending") : undefined} className={right ? "text-right!" : ""}>
      <a href={`/admin/research?qsort=${key}${all ? "&qall=1" : ""}#health`} className="text-ink-muted" title={key === "side" ? SIDE_NOTE : undefined}>
        {SORT_LABELS[key]}
        {sort === key ? (key === "item" ? " ↑" : " ↓") : ""}
      </a>
    </th>
  );
  const worst = worstBothAgree(pairs);
  const shown = all ? rows : rows.slice(0, HEALTH_FIRST_ROWS);
  return (
    <Card id="health" title="Question health">
      <Note>
        Every scored statement on current content, most on one side first. The bars run from Strongly disagree (left) to
        Strongly agree (right). Most on one side: {SIDE_NOTE.toLowerCase()}; over 80% is in bold once 30 people have
        answered. Sort by any column.
      </Note>
      <TableBox label="Question health" min="min-w-[44rem]">
        <thead>
          <tr>
            {head("item", false)}
            <th scope="col">Answers, 1 to 7</th>
            {head("answered")}
            {head("skip")}
            {head("changed")}
            {head("side")}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.item}>
              <td>
                <span className="font-semibold text-ink-muted">{r.item}</span> {r.text}
                {r.few && !early && <Few />}
              </td>
              <td>
                <Spark counts={r.spread} label={`${r.item}: ${r.spread.map((n, i) => `${i + 1}: ${n}`).join(", ")}`} />
              </td>
              <td className={num}>{fmt.format(r.answered)}</td>
              <td className={num}>{Math.round(r.skipRate * 100)}%</td>
              <td className={num}>{Math.round(r.changedRate * 100)}%</td>
              <td className={`${num} ${flagged(r.oneSideFlag)}`}>
                {Math.round(r.oneSide * 100)}%{r.oneSideFlag && <span className="block text-[0.8125rem] leading-4">nearly everyone</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </TableBox>
      {!all && rows.length > shown.length && (
        <a href={`/admin/research?qsort=${sort}&qall=1#health`} className="inline-flex min-h-11 items-center font-semibold">
          Show all {rows.length}
        </a>
      )}
      <h3 className="mt-2 text-[1.0625rem] leading-6 font-bold">Agree with both</h3>
      <Note>
        Pairs of statements on the same theme that point opposite ways, and the share of people who answered both who agreed
        with both. A high share can mean one of them is read differently than meant.
      </Note>
      {worst.length === 0 ? (
        <p className="text-ink-muted">No pairs where people agreed with both yet.</p>
      ) : (
        <ol className="flex flex-col">
          {worst.map((p) => (
            <li key={`${p.a}-${p.b}`} className="flex flex-wrap gap-x-3 border-b border-line py-2.5">
              <span className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-ink-muted">{p.a}</span> {p.aText}
                <span className="block">
                  <span className="text-ink-muted">and </span>
                  <span className="text-sm font-semibold text-ink-muted">{p.b}</span> {p.bText}
                </span>
                {p.n < 30 && !early && <Few />}
              </span>
              <span className="tabular-nums">
                {Math.round(p.share * 100)}% of {countOf(p.n, "person", "people")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** One line under the page heading while current content has fewer than FEW responses. */
export function EarlyNote() {
  return (
    <p role="note" className="max-w-[47.5rem] rounded-md border-2 border-second bg-surface-raised p-3 text-base font-semibold">
      Fewer than 30 responses on current content. Treat everything below as early.
    </p>
  );
}
