// What's changed: the changelog from content/copy.json, newest first (docs/04 section 8).
// No reference screen yet, so this is built plainly from the design system rules.
import type { Metadata } from "next";
import { BackLink } from "@/components/resume";
import { SiteFooter } from "@/components/site-footer";
import { fill, getCopy } from "@/lib/content/copy";

export const metadata: Metadata = { title: "What's changed" };

export default function Changes() {
  const copy = getCopy();
  const { heading, intro, labels, entries } = copy.changelog;
  return (
    <div className="px-4 pt-2 pb-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-measure-body flex-col gap-6">
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-4">
          <BackLink />
          <span className="type-small font-bold">{copy.site.name}</span>
        </header>
        <main className="flex flex-col gap-10">
          <div className="flex flex-col gap-4">
            <h1 className="type-title">{heading}</h1>
            <p>{intro}</p>
          </div>
          {entries.map((e) => (
            <section key={e.version} aria-labelledby={`v-${e.version}`} className="flex flex-col gap-3">
              <h2 id={`v-${e.version}`} className="type-body font-bold">
                {e.date ? fill(labels.version, { version: e.version, date: e.date }) : fill(labels.version_unreleased, { version: e.version })}
              </h2>
              <dl className="flex flex-col gap-3">
                {(
                  [
                    [labels.what, e.what],
                    [labels.why, e.why],
                    [labels.based_on, e.based_on],
                    [labels.past_results, e.past_results],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-semibold">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
