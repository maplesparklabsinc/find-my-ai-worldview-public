// The results page body (docs/01-product-spec.md 5.6, issues #28 and #37).
// Presentational only, so it renders on the server for /r/{id} and in the
// browser for an unsaved result. The person's result comes first, then the six
// answers, the owner's fit, share and research cards (`owner`), the rest folded
// under "Go deeper", and whatever the page ends with (`end`).
import { CheckIcon, DashIcon, PairIcon } from "@/components/icons";
import { Inline } from "@/components/markdown";
import { DeeperRow, type DeeperSection } from "@/components/results/actions";
import { fill, getCopy } from "@/lib/content/copy";
import type { PerspectiveView, ResultView, TrackView } from "@/lib/results";
import { text as size } from "./type";

export function Section({ id, title, children, gap = "gap-4" }: { id: string; title: React.ReactNode; children: React.ReactNode; gap?: string }) {
  return (
    <section aria-labelledby={id} className={`flex flex-col ${gap}`}>
      <h2 id={id} className="type-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-raised p-4">{children}</div>;
}

/**
 * `before` renders above the result (the visitor's banner and invitation, the
 * friend comparison). `afterTop` follows the result (the guess beside it,
 * sending a comparison back). `owner` comes after the six answers (fit, share
 * and research cards); `help` is the "Help us get this right" row, already
 * limited to the owner by the caller. `end` closes the page (take the quiz
 * again or the visitor's invitation, then the earlier-version note). The
 * wording is the same for everyone: a visitor reads the result as written for
 * its owner, after a banner saying it was shared with them (issue #37).
 */
export function ResultBody({
  view,
  before,
  afterTop,
  owner,
  help,
  end,
}: {
  view: ResultView;
  before?: React.ReactNode;
  afterTop?: React.ReactNode;
  owner?: React.ReactNode;
  help?: React.ReactNode;
  end?: React.ReactNode;
}) {
  const r = getCopy().results;

  return (
    // At 320px with 200% text a long word ("Precautionists") can be wider than
    // its card; let it break rather than widen the page (issue #18).
    <main className="flex flex-col gap-8 [overflow-wrap:anywhere]">
      {before}
      <div className="flex flex-col gap-4">{view.perspective ? <MatchedTop view={view} /> : <OutcomeTop view={view} />}</div>
      {afterTop}

      <section aria-labelledby="six" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="six" className="type-title">
            {r.six_answers}
          </h2>
          <p className="type-small text-ink-muted">{r.six_intro}</p>
        </div>
        <div className="flex flex-col rounded-md border border-line bg-surface-raised px-4">
          {view.tracks.map((t, i) => (
            <AnswerRow key={t.construct} t={t} first={i === 0} />
          ))}
        </div>
      </section>

      {owner}

      <section aria-labelledby="deeper" className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <h2 id="deeper" className="type-title">
            {r.go_deeper}
          </h2>
          <p className="type-small text-ink-muted">{r.go_deeper_intro}</p>
        </div>
        <div className="flex flex-col border-t border-line">
          {deeperRows(view).map(({ section, title, body }) => (
            <DeeperRow key={section} section={section} title={title}>
              {body}
            </DeeperRow>
          ))}
          {help}
          <DeeperRow section="why" title={r.why}>
            <p>
              {view.whyThisResult} <Inline text="[How this works](/how-it-works)" />
            </p>
            {/* The early-version note, on every outcome (issue #37). */}
            <p>
              <Inline text={view.provisional} />
            </p>
          </DeeperRow>
        </div>
      </section>

      {end}
    </main>
  );
}

type Row = { section: DeeperSection; title: React.ReactNode; body: React.ReactNode };

/** The Go deeper rows before "Help us get this right", in page order (issue #28). */
function deeperRows(view: ResultView): Row[] {
  const r = getCopy().results;
  const rows: Row[] = [];
  // Own combination already shows the tension as "What's distinctive", right under its headline.
  if (view.tension && view.outcome !== "mixed_unmatched") {
    rows.push({ section: "stands_out", title: r.what_stands_out, body: <p>{view.tension.text}</p> });
  }
  if (view.perspective) {
    rows.push({ section: "talk", title: r.something_to_talk_about, body: <p>{view.perspective.discussionPrompt}</p> });
    if (view.perspective.elsewhere) {
      rows.push({ section: "elsewhere", title: r.elsewhere, body: <p><Inline text={view.perspective.elsewhere} /></p> });
    }
  }
  view.between?.forEach((p, i) =>
    rows.push({ section: i === 0 ? "about_p1" : "about_p2", title: fill(r.about_perspective, { perspective: p.name }), body: <About p={p} /> }),
  );
  const s = view.statements;
  if (s.commonGround.length > 0 || s.unexpected || s.difference) {
    rows.push({
      section: "common_ground",
      title: r.common_ground,
      body: (
        <ul className="flex flex-col gap-3">
          {s.commonGround.map((x) => (
            <Statement key={x} icon={<CheckIcon strokeWidth={1.5} className="text-accent" />} text={x} />
          ))}
          {s.unexpected && <Statement icon={<PairIcon className="text-accent" />} text={s.unexpected} />}
          {s.difference && <Statement icon={<DashIcon className="text-ink-muted" />} text={s.difference} />}
        </ul>
      ),
    });
  }
  if (view.baseRates.length > 0) {
    rows.push({
      section: "others",
      title: r.you_and_others,
      body: (
        <>
          {view.baseRates.map((b) => (
            <div key={b.text} className="flex flex-col gap-1">
              <p>{b.text.charAt(0).toUpperCase() + b.text.slice(1)}</p>
              <span className={`${size.note} text-ink-muted`}>
                {b.fromOtherCountry && <>{fill(r.other_country, { country: b.countryName })} · </>}
                {fill(r.source_line, { source: b.source, year: b.year, population: b.population })}
              </span>
            </div>
          ))}
          <p className={`${size.note} text-ink-muted`}>{r.polls_note}</p>
        </>
      ),
    });
  }
  return rows;
}

/** One of the six answers: the question, a track with the person's marker, and the band in words. */
function AnswerRow({ t, first }: { t: TrackView; first: boolean }) {
  // The short end labels, as on the share image.
  const [low, high] = getCopy().share.card.ends[t.construct] ?? [t.lowLabel, t.highLabel];
  const ends = (
    <div aria-hidden={t.position !== null} className={`flex flex-wrap justify-between gap-x-4 gap-y-1 ${size.ends} text-ink-muted`}>
      <span>{low}</span>
      <span className="ml-auto text-right">{high}</span>
    </div>
  );
  return (
    <div className={`flex flex-col gap-1 py-4 ${first ? "" : "border-t border-line"}`}>
      <span className={`${size.row} font-bold`}>{t.question}</span>
      {t.position !== null && (
        // The marker stays inside the track at both ends; the band text is its text equivalent.
        <div role="img" aria-label={t.bandText} className="relative mt-1 h-6">
          <div className="absolute inset-x-0 top-[11px] h-0.5 rounded-pill bg-line-strong/75" />
          <div className="absolute top-[7px] left-0 h-2.5 w-0.5 rounded-pill bg-line-strong" />
          <div className="absolute top-[7px] right-0 h-2.5 w-0.5 rounded-pill bg-line-strong" />
          <div className="absolute top-1 left-1/2 -ml-px h-4 w-0.5 rounded-pill bg-line-strong" />
          <div
            className="absolute top-[3px] -ml-[9px] size-[18px] rounded-pill bg-accent ring-3 ring-surface-raised"
            style={{ left: `calc(9px + (100% - 18px) * ${t.position.toFixed(4)})` }}
          />
        </div>
      )}
      {ends}
      <span className="type-small text-ink">{t.bandText}</span>
    </div>
  );
}

/** The hero for a matched result: name, tagline, description and the strongest objection. */
function MatchedTop({ view }: { view: ResultView }) {
  const r = getCopy().results;
  const p = view.perspective!;
  // The label is part of the heading, which reads as the full headline
  // ("Your closest perspective: Stewards"), not the name alone.
  const heading = (headline: string, label: string) => (
    <h1 aria-label={headline} className="flex flex-col gap-1 type-display">
      <span className="type-small font-normal text-ink-muted">{label}</span>
      {p.name}
    </h1>
  );
  return (
    <>
      <div className="flex flex-col gap-4 rounded-md bg-accent-soft px-4 py-6">
        {heading(view.headline, r.closest_label)}
        <p className={`${size.lead} font-semibold`}>{p.tagline}</p>
        <p className={size.card}>{p.description}</p>
        <div className="h-px bg-line" />
        <div className="flex flex-col gap-1">
          <span className={`${size.note} font-bold text-ink-muted`}>{r.strongest_objection}</span>
          <p className={size.card}>{p.strongestObjection}</p>
        </div>
      </div>
      {view.subhead && <p className="type-small text-ink-muted">{view.subhead}</p>}
      <UnsettledNote view={view} />
    </>
  );
}

/** The hero and own section for the other outcomes (docs/01-product-spec.md 5.6). */
function OutcomeTop({ view }: { view: ResultView }) {
  const r = getCopy().results;
  const d = view.detail;
  return (
    <>
      <div className="flex flex-col gap-3 rounded-md bg-accent-soft px-4 py-6">
        <span className="type-small text-ink-muted">
          {r.other_label}
        </span>
        <h1 className={`${size.headline} font-bold`}>
          {view.headline}
        </h1>
        {view.subhead && <p className={size.card}>{view.subhead}</p>}
        {view.subheadSources.map((src) => (
          <span key={src} className={`${size.note} text-ink-muted`}>
            {src}
          </span>
        ))}
      </div>
      <UnsettledNote view={view} />

      {d.type === "mixed_between" && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {d.cards.map(({ perspective, shared }) => (
              <div key={perspective.id} className="flex flex-col gap-2 rounded-md border border-line bg-surface-raised p-4">
                <div className="flex flex-col">
                  <span className={`${size.heading} font-bold`}>{perspective.name}</span>
                  <span className={`${size.row} text-ink-muted`}>{perspective.tagline}</span>
                </div>
                {shared && <p className={size.card}>{shared}</p>}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-raised p-4">
            <span className={`${size.note} font-bold text-ink-muted`}>{r.tip_heading}</span>
            <p className={size.card}>{d.tip.question}</p>
          </div>
        </>
      )}

      {d.type === "mixed_unmatched" && (
        <>
          {d.overlap && <p>{d.overlap}</p>}
          {d.distinctive && (
            <Section id="distinctive" title={d.heading} gap="gap-3">
              <Card>
                <p>{d.distinctive}</p>
              </Card>
            </Section>
          )}
          {d.nearest.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="type-small text-ink-muted">{d.nearestLabel}</p>
              <PerspectiveChips perspectives={d.nearest} />
            </div>
          )}
        </>
      )}

      {d.type === "undecided" && (
        <>
          <Section id="lean" title={d.leanHeading} gap="gap-3">
            {d.leanings.length === 0 ? (
              <p>{d.leanNone}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {d.leanings.map((l) => (
                  <li key={l.construct} className="flex flex-col">
                    <span className="font-semibold">{l.question}</span>
                    <span>{l.bandText}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {d.prompts.length > 0 && (
            <Section id="think" title={d.promptsHeading} gap="gap-3">
              <ol className="flex flex-col gap-3">
                {d.prompts.map((prompt, i) => (
                  <li key={prompt} className="flex gap-3">
                    <span className="w-7 flex-none font-bold text-accent" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>{prompt}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </>
      )}

      {d.type === "indifferent" && (
        <Section id="divide" title={d.heading} gap="gap-3">
          <p>{d.body}</p>
        </Section>
      )}
    </>
  );
}

/** For someone unsure who answered strongly: their views are still forming (docs/02 section 3). */
function UnsettledNote({ view }: { view: ResultView }) {
  if (!view.unsettledNote) return null;
  return <p className="rounded-md border border-line bg-surface-raised p-4">{view.unsettledNote}</p>;
}

function Statement({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-1 flex-none">{icon}</span>
      <p>{text}</p>
    </li>
  );
}

function PerspectiveChips({ perspectives }: { perspectives: PerspectiveView[] }) {
  return (
    <div className="flex flex-col gap-2">
      {perspectives.map((x) => (
        <details key={x.id} className="group">
          <summary className="inline-flex min-h-tap-min cursor-pointer items-center rounded-pill border border-line-strong bg-surface-raised px-4 type-option">
            {x.name}
          </summary>
          <div className="mt-2 flex flex-col gap-2 pl-1">
            <p className="font-semibold">{x.tagline}</p>
            <p>{x.description}</p>
          </div>
        </details>
      ))}
    </div>
  );
}

/**
 * An "About {perspective}" row for In between: description, the strongest
 * objection, something to talk about and, from taxonomy 0.3.0, the names people
 * use for it elsewhere.
 */
function About({ p }: { p: PerspectiveView }) {
  const r = getCopy().results;
  return (
    <>
      <p>{p.description}</p>
      <div className="flex flex-col gap-0.5">
        <span className={`${size.note} font-bold text-ink-muted`}>{r.strongest_objection}</span>
        <p>{p.strongestObjection}</p>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={`${size.note} font-bold text-ink-muted`}>{r.something_to_talk_about}</span>
        <p>{p.discussionPrompt}</p>
      </div>
      {p.elsewhere && (
        <div className="flex flex-col gap-0.5">
          <span className={`${size.note} font-bold text-ink-muted`}>{r.elsewhere}</span>
          <p>
            <Inline text={p.elsewhere} />
          </p>
        </div>
      )}
    </>
  );
}
