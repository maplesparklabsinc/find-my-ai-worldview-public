// The friend comparison at the top of a result page (docs/01-product-spec.md
// 5.8, design/screens/Compare). Server rendered. Two markers per track: yours a
// filled disc above the line, theirs a ring below, each with a name label.
import { CheckIcon } from "@/components/icons";
import { Track } from "@/components/ui";
import { fill, getCopy } from "@/lib/content/copy";
import type { CompareView, ResultView } from "@/lib/results";

function closest(v: ResultView): { id: string | null; name: string } {
  const p = v.ranking[0];
  return p ? { id: p.id, name: p.name } : { id: null, name: v.headline };
}

export function Comparison({ you, them, themName, view }: { you: ResultView; them: ResultView; themName: string; view: CompareView }) {
  const c = getCopy().compare;
  const a = closest(you);
  const b = closest(them);
  const gap = view.biggestGap;
  const summary = !gap
    ? view.noDifference
      ? c.no_difference
      : c.no_gap
    : a.id !== null && a.id === b.id
      ? fill(c.same_place, { perspective: a.name, question: gap.question })
      : fill(c.different_places, { question: gap.question });

  return (
    <div className="flex flex-col gap-10 border-b border-line pb-10">
      <div className="flex flex-col gap-4">
        <h1 className="type-display">{fill(c.section_heading, { name: themName })}</h1>
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-md bg-accent-soft p-4">
            <span className="flex items-center gap-2 type-small text-ink-muted">
              <span aria-hidden="true" className="size-4 flex-none rounded-pill bg-accent" />
              {c.you_label}
            </span>
            <span className="text-[1.375rem] leading-7 font-bold">{a.name}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-raised p-4">
            <span className="flex items-center gap-2 type-small text-ink-muted">
              <span aria-hidden="true" className="size-3 flex-none rounded-pill border-2 border-second bg-surface-raised" />
              {capitalise(themName)}
            </span>
            <span className="text-[1.375rem] leading-7 font-bold">{b.name}</span>
          </div>
        </div>
        <p>{summary}</p>
      </div>

      <section aria-labelledby="side-by-side" className="flex flex-col gap-8">
        <h2 id="side-by-side" className="type-title">
          {c.side_by_side}
        </h2>
        {view.tracks.map((t) => (
          <div key={t.construct} className="flex flex-col gap-1">
            <span className="font-semibold">{t.question}</span>
            {t.a.position !== null && t.b.position !== null ? (
              <Track
                label={fill(c.track_label, { you_label: c.you_label, you: t.a.bandText, them_label: capitalise(themName), them: t.b.bandText })}
                low={t.lowLabel}
                high={t.highLabel}
                markers={[
                  { position: t.b.position, kind: "friend", name: capitalise(themName) },
                  { position: t.a.position, kind: "you", name: c.you_label },
                ]}
              />
            ) : (
              <p className="type-small text-ink-muted">
                {fill(c.track_label, { you_label: c.you_label, you: t.a.bandText, them_label: capitalise(themName), them: t.b.bandText })}
              </p>
            )}
          </div>
        ))}
      </section>

      {view.agree.length > 0 && (
        <section aria-labelledby="where-agree" className="flex flex-col gap-4">
          <h2 id="where-agree" className="type-title">
            {c.agree_heading}
          </h2>
          <ul className="flex flex-col gap-4">
            {view.agree.map((s) => (
              <li key={s} className="flex items-start gap-3">
                <CheckIcon strokeWidth={1.5} className="mt-1 flex-none text-accent" />
                <p>{s}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.disagree.length > 0 && (
        <section aria-labelledby="where-split" className="flex flex-col gap-4">
          <h2 id="where-split" className="type-title">
            {c.split_heading}
          </h2>
          {view.disagree.map((s) => {
            // "You split on whether …. Ask each other: …" shows as statement plus muted prompt.
            const [statement, ...prompt] = s.split(/(?<=\.) /);
            return (
              <div key={s} className="flex flex-col gap-2 rounded-md border border-line bg-surface-raised p-4">
                <p>{statement}</p>
                {prompt.length > 0 && <p className="type-small text-ink-muted">{prompt.join(" ")}</p>}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
