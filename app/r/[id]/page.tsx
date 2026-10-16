// A stored result, /r/{id} (docs/01-product-spec.md 5.6). Anyone with the link
// sees the same result. For anyone but its owner the page is an invitation to
// take the quiz and compare (issue #37): the quiz they start is linked to this
// result, as a compare link (/c/{id}) is. A result taken that way opens with
// the comparison; /r/{friendId}?vs={originalId} is that comparison seen by the
// person who shared the result.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Inline } from "@/components/markdown";
import {
  CompareBar,
  DeeperRow,
  FitCard,
  HelpUs,
  OwnerOnly,
  PredictionReflection,
  ReadOnlyView,
  ResearchSignup,
  SendBack,
  ShareBox,
  TakeAgain,
  TakeIt,
  VisitorCompare,
} from "@/components/results/actions";
import { Comparison } from "@/components/results/comparison";
import { ResultBody } from "@/components/results/result-view";
import { ResultShell } from "@/components/results/shell";
import { cardAlt } from "@/components/share-card";
import { LinkButton } from "@/components/ui";
import { fill, getCopy } from "@/lib/content/copy";
import { isSharedView, shareText } from "@/lib/results";
import { comparison, loadResponse, shown } from "@/lib/stored";

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const { id } = await params;
  const copy = getCopy();
  const row = await loadResponse(id);
  // Before the page streams, so a missing result is a real 404 (metadata blocks
  // for every user agent: htmlLimitedBots in next.config.ts).
  if (!row) notFound();
  const s = await shown(row);
  const title = s.view ? shareText(s.release!.copy, s.view) : (s.headline ?? fill(copy.result_page.title, { site: copy.site.name }));
  // The share card is the og:image (opengraph-image.tsx, 1200×630), so a shared link previews with it.
  return {
    title,
    description: copy.landing.lede,
    robots: { index: false },
    openGraph: { title, description: copy.landing.lede },
    twitter: { card: "summary_large_image", title, description: copy.landing.lede },
  };
}

export default function Page({ params, searchParams }: PageProps<"/r/[id]">) {
  return (
    <ResultShell>
      <Suspense fallback={<Loading />}>
        <StoredResult params={params} searchParams={searchParams} />
      </Suspense>
    </ResultShell>
  );
}

function Loading() {
  return (
    <main aria-busy="true" className="flex flex-col gap-4">
      <p className="text-ink-muted">{getCopy().result_page.loading}</p>
      <div className="h-40 animate-pulse rounded-md bg-accent-soft motion-reduce:animate-none" />
    </main>
  );
}

async function StoredResult({ params, searchParams }: Pick<PageProps<"/r/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const { vs, view: viewParam } = await searchParams;
  // The link people share: read-only for everyone, the owner included (issue #37).
  const readOnly = isSharedView(viewParam);
  const copy = getCopy();
  const row = await loadResponse(id);
  // Already a 404 from generateMetadata; kept so the page never renders without a row.
  if (!row) notFound();
  const me = await shown(row);

  const other = row.compared_with ? await loadResponse(row.compared_with) : null;
  const them = other ? await shown(other) : null;
  // At the very end of the page, for owner and visitor alike (issue #37).
  const banner = (me.outdated || them?.outdated) && (
    <p className="rounded-md border border-line bg-surface-raised p-4 type-small [&_a]:text-ink">
      <Inline text={copy.result_page.old_version} />
    </p>
  );
  // Whose result this is, for anyone but the browser that saved it.
  const shared = (
    <OwnerOnly
      id={id}
      otherwise={<p className="rounded-md border border-line bg-surface-raised p-4 type-small">{copy.result_page.shared_anonymous}</p>}
    >
      {null}
    </OwnerOnly>
  );

  if (!me.view) {
    return (
      <ReadOnlyView on={readOnly}>
        <main className="flex flex-col gap-6">
          {shared}
          <div className="flex flex-col gap-3 rounded-md bg-accent-soft px-4 py-6">
            <span className="type-small text-ink-muted">
              {copy.results.other_label}
            </span>
            <h1 className="type-display">
              {me.headline}
            </h1>
          </div>
          <OwnerOnly id={id} otherwise={<TakeIt />}>
            <TakeAgain saved />
          </OwnerOnly>
          <p className="[&_a]:text-ink">
            <Inline text={copy.result_page.missing_version} />
          </p>
        </main>
      </ReadOnlyView>
    );
  }
  const view = me.view;

  // The person who sent the compare link, looking at the comparison their friend sent back.
  const back = them ? comparison(them, me) : null;
  if (them?.view && back && vs === them.row.id) {
    return (
      <main className="flex flex-col gap-10">
        <Comparison you={them.view} them={view} themName={copy.compare.friend_fallback} view={back} />
        <LinkButton href={`/r/${them.row.id}`} variant="secondary">
          {copy.compare.your_result}
        </LinkButton>
        {banner}
      </main>
    );
  }

  const themName = copy.compare.friend_fallback;
  const cmp = them ? comparison(me, them) : null;
  const before = (
    <>
      {shared}
      <OwnerOnly id={id} otherwise={<VisitorCompare id={id} place="top" />}>
        {null}
      </OwnerOnly>
      {them?.view && cmp && <Comparison you={view} them={them.view} themName={themName} view={cmp} />}
    </>
  );

  return (
    <ReadOnlyView on={readOnly}>
      <ResultBody
        view={view}
        before={before}
        afterTop={
          <OwnerOnly id={id}>
            <PredictionReflection id={id} outcome={me.result.outcome} />
            {them && <SendBack id={id} vs={them.row.id} name={themName} />}
          </OwnerOnly>
        }
        owner={
          // Share after the fit questions, so people share once they've judged their result (issue #37).
          <OwnerOnly id={id}>
            <FitCard id={id} />
            <ShareBox id={id} text={shareText(me.release!.copy, view)} imageAlt={cardAlt({ view, headline: view.headline })} />
            <ResearchSignup id={id} />
          </OwnerOnly>
        }
        help={
          <OwnerOnly id={id}>
            <DeeperRow section="help" title={copy.fit.section_heading}>
              <HelpUs
                id={id}
                others={me
                  .release!.content.perspectives.perspectives.filter((p) => p.id !== view.perspective?.id)
                  .map(({ id, name, tagline }) => ({ id, name, tagline }))}
                tracks={view.tracks.flatMap((t) =>
                  t.position === null
                    ? []
                    : [
                        {
                          construct: t.construct,
                          question: t.question,
                          low: t.lowLabel,
                          high: t.highLabel,
                          position: t.position,
                          bandText: t.bandText,
                        },
                      ],
                )}
              />
            </DeeperRow>
          </OwnerOnly>
        }
        end={
          <>
            <OwnerOnly
              id={id}
              otherwise={
                <>
                  <VisitorCompare id={id} place="end" />
                  <CompareBar id={id} />
                </>
              }
            >
              <TakeAgain saved />
            </OwnerOnly>
            {banner}
          </>
        }
      />
    </ReadOnlyView>
  );
}
