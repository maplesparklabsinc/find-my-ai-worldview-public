import { BackLink } from "./resume";
import { Markdown } from "./markdown";
import { SiteFooter } from "./site-footer";
import { getCopy } from "@/lib/content/copy";

/** A plain reading page (How this works, Privacy) for markdown from content/pages. */
export function ReadingPage({ source }: { source: string }) {
  const copy = getCopy();
  return (
    <div className="px-4 pt-2 pb-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-measure-body flex-col gap-6">
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-4">
          <BackLink />
          <span className="type-small font-bold">{copy.site.name}</span>
        </header>
        <main>
          <Markdown source={source} />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
