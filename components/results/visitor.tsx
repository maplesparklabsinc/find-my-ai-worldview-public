// A visitor's view of someone's shared result (issue #91): the notice, the
// "Where would you land?" box, the sharer's result by name and tagline only,
// their six tracks, and the box again. None of it speaks to the visitor as if
// the result were theirs, and Go deeper stays with the owner, so the way to
// read more is to take the quiz. Rendered on the server; the page shows it
// only once it knows the browser isn't the owner's.
import { CompareBar, SharedResultViewed, VisitorCompare } from "@/components/results/actions";
import { SixAnswers } from "@/components/results/result-view";
import { cardText } from "@/components/share-card";
import { getCopy } from "@/lib/content/copy";
import type { ResultView } from "@/lib/results";
import { text as size } from "./type";

/**
 * The name and tagline of a result, as on its share image: the perspective
 * and its tagline, or the outcome's title and subtitle (`share.card`).
 */
export function theirResult(view: ResultView): { title: string; line: string } {
  const { title, line } = cardText({ view, headline: view.headline });
  // The share image lists In between's two perspectives in place of a subtitle; this card names them in the title.
  return { title, line: view.outcome === "mixed_between" ? getCopy().share.card.subtitle.mixed_between : line };
}

export function VisitorResult({ id, view }: { id: string; view: ResultView }) {
  const p = getCopy().result_page;
  const { title, line } = theirResult(view);
  return (
    <main className="flex flex-col gap-8 [overflow-wrap:anywhere]">
      <SharedResultViewed id={id} />
      <p className="rounded-md border border-line bg-surface-raised p-4 type-small">{p.shared_anonymous}</p>
      <VisitorCompare id={id} place="top" />
      <div className="flex flex-col gap-4 rounded-md bg-accent-soft px-4 py-6">
        <h1 aria-label={`${p.visitor_label}: ${title}`} className="flex flex-col gap-1 type-display">
          <span className="type-small font-normal text-ink-muted">{p.visitor_label}</span>
          {title}
        </h1>
        {line && <p className={`${size.lead} font-semibold`}>{line}</p>}
      </div>
      <SixAnswers heading={p.visitor_tracks_heading} intro={p.visitor_tracks_intro} tracks={view.tracks} />
      <VisitorCompare id={id} place="end" />
      <CompareBar id={id} />
    </main>
  );
}
