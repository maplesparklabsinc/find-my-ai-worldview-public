import Link from "next/link";
import { Facts } from "@/components/facts";
import { SeenOnce, StartButton } from "@/components/landing";
import { StartOrResume } from "@/components/resume";
import { SiteFooter } from "@/components/site-footer";
import { getContent } from "@/lib/content";
import { fill, getCopy } from "@/lib/content/copy";
import { screenCount } from "@/lib/form";

// The landing page (docs/01-product-spec.md 5.1, issue #24): the promise and
// the commitment, three steps, then the perspectives as equal cards in
// their listed order, with a second start button after them.
export default function Landing() {
  const copy = getCopy();
  const l = copy.landing;
  const content = getContent();
  const { perspectives } = content.perspectives;
  const n = screenCount(content);
  return (
    <div className="flex min-h-dvh flex-col px-4 pt-2 pb-6 sm:px-6">
      <header className="mx-auto flex min-h-14 w-full max-w-[65rem] items-center">
        <span className="type-small font-bold">{copy.site.name}</span>
      </header>

      <main className="mx-auto flex w-full max-w-[65rem] flex-1 flex-col gap-16 py-6 [overflow-wrap:anywhere]">
        <div className="grid grid-cols-1 items-center gap-x-16 gap-y-10 md:grid-cols-2">
          <div className="flex max-w-[35rem] flex-col gap-6">
            <div className="flex flex-col gap-4">
              <h1 className="type-display">{l.headline}</h1>
              <p>{l.lede}</p>
              <Facts facts={l.facts} />
            </div>
            <div className="flex max-w-[22.5rem] flex-col gap-3">
              <StartOrResume>
                <StartButton position="hero" label={l.start_button} />
              </StartOrResume>
            </div>
            <nav aria-label="About this quiz" className="flex flex-wrap gap-x-6 type-small">
              <Link href="/how-it-works" className="flex min-h-tap-min items-center">
                How this works
              </Link>
              <Link href="/privacy" className="flex min-h-tap-min items-center">
                Privacy
              </Link>
            </nav>
          </div>

          <section aria-labelledby="steps" className="flex flex-col gap-4 rounded-md border border-line bg-surface-raised px-4 py-6">
            <h2 id="steps" className="type-body font-bold">
              {l.steps_heading}
            </h2>
            <ol className="flex list-decimal flex-col gap-3 pl-6">
              {l.steps.map((s) => (
                <li key={s}>{fill(s, { n })}</li>
              ))}
            </ol>
          </section>
        </div>

        <section aria-labelledby="perspectives">
          <SeenOnce className="flex flex-col gap-6">
            <div className="flex max-w-measure-body flex-col gap-4">
              <h2 id="perspectives" className="type-title">
                {l.perspectives_heading}
              </h2>
              <p>{l.perspectives_intro}</p>
            </div>
            {/* Equal cards in the listed order; no colour or position marks any of them out.
                Every row is as tall as the tallest, so a last card alone on its row stays
                the same size, at the left (issue #39). */}
            <ul className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {perspectives.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 rounded-md border border-line bg-surface-raised p-4">
                  <h3 className="type-body font-bold">{p.name}</h3>
                  <p>{p.tagline}</p>
                </li>
              ))}
            </ul>
            <p className="max-w-measure-body text-ink-muted">{l.perspectives_note}</p>
            <div className="max-w-[22.5rem]">
              <StartOrResume>
                <StartButton position="perspectives" label={l.second_start_button} />
              </StartOrResume>
            </div>
          </SeenOnce>
        </section>
      </main>

      <SiteFooter className="mx-auto w-full max-w-[65rem]" />
    </div>
  );
}
