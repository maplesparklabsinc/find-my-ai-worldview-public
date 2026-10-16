// /admin/responses (issue #37): single responses, newest first, 50 a page, for
// one content release (the current one unless ?release= picks another) and
// optionally one result (?result=). Same gate as /admin (proxy.ts). No emails,
// no free text, no feedback text. Copy here is founder-facing UI, not public
// site copy.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminHeader } from "@/components/admin-header";
import { countOf, versionsLine } from "@/lib/admin";
import { adminPassword } from "@/lib/admin/gate";
import { PAGE_SIZE, buildResponseList, parsePage, parseResultFilter, releaseVersions, resultFilterOptions } from "@/lib/admin/responses";
import { contentVersions, getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { loadReleaseByKey, releaseKey, releaseKeys } from "@/lib/content/release";
import { listResponses } from "@/lib/db/admin";

export const metadata: Metadata = {
  title: "Admin: responses",
  robots: { index: false, follow: false },
};

export default function Page({ searchParams }: PageProps<"/admin/responses">) {
  return (
    <div className="px-4 pb-16 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-[75rem] flex-col gap-8 wrap-anywhere">
        <Suspense fallback={<p className="pt-6 text-ink-muted">Loading…</p>}>
          <Responses searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

const field = "min-h-11 rounded-sm border border-line-strong bg-surface-raised px-3 text-base text-ink";

async function Responses({ searchParams }: Pick<PageProps<"/admin/responses">, "searchParams">) {
  await connection();
  if (!adminPassword()) notFound();
  const params = await searchParams;
  const content = getContent();
  const currentKey = releaseKey(contentVersions(content));
  // Newest first.
  const keys = (await releaseKeys()).reverse();
  const key = releaseVersions(params.release, keys) ? (params.release as string) : currentKey;
  const versions = releaseVersions(key, [...keys, currentKey])!;
  // Names and labels as that release worded them; the current content if it was never frozen.
  const shownContent = (await loadReleaseByKey(key))?.content ?? content;
  const filter = parseResultFilter(params.result, shownContent);
  const page = parsePage(params.page);
  const { rows, total } = await listResponses(versions, filter, page);
  const list = buildResponseList(rows, shownContent, getCopy());
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedResult = typeof params.result === "string" && filter ? params.result : "";
  const href = (p: number) => {
    const q = new URLSearchParams({ release: key, ...(selectedResult ? { result: selectedResult } : {}), page: String(p) });
    return `/admin/responses?${q.toString()}`;
  };

  return (
    <>
      <AdminHeader current="/admin/responses">
        <span>Live content {versionsLine(contentVersions(content))}</span>
      </AdminHeader>

      <main className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[2rem] leading-10 font-bold">Responses</h1>
          <p className="max-w-[47.5rem] text-base text-ink-muted">
            One row per completed quiz, newest first. Open one to see every answer. Emails, the free-text answer and
            feedback text are never shown here.
          </p>
        </div>

        <form method="get" action="/admin/responses" className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Content release
            <select name="release" defaultValue={key} className={field}>
              {!keys.includes(currentKey) && <option value={currentKey}>{currentKey} (current, not frozen)</option>}
              {keys.map((k) => (
                <option key={k} value={k}>
                  {k}
                  {k === currentKey && " (current)"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Result
            <select name="result" defaultValue={selectedResult} className={field}>
              <option value="">All results</option>
              {resultFilterOptions(shownContent).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-md border border-line-strong bg-surface-raised px-4 font-semibold">
            Show
          </button>
        </form>

        <p role="status" className="text-base">
          {total === 0 ? "No responses match." : `${countOf(total, "response", "responses")} · page ${page} of ${pages}`}
        </p>

        {list.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-line bg-surface-raised">
            <table className="w-full border-collapse text-left text-base">
              <thead>
                <tr className="border-b border-line text-sm text-ink-muted">
                  <th scope="col" className="p-3 font-semibold">Response</th>
                  <th scope="col" className="p-3 font-semibold">Completed</th>
                  <th scope="col" className="p-3 font-semibold">Result</th>
                  <th scope="col" className="p-3 font-semibold">Fit</th>
                  <th scope="col" className="p-3 font-semibold">Guess or quick check</th>
                  <th scope="col" className="p-3 text-right font-semibold">Answered</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="p-3 font-mono text-sm">
                      <a href={`/admin/responses/${r.id}`}>{r.id}</a>
                    </td>
                    <td className="p-3 whitespace-nowrap">{r.date}</td>
                    <td className="p-3">{r.result}</td>
                    <td className="p-3 whitespace-nowrap">{r.fit}</td>
                    <td className="p-3">{r.guessOrCheck}</td>
                    <td className="p-3 text-right tabular-nums">{r.answered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <nav aria-label="Pages" className="flex flex-wrap gap-x-6">
            {page > 1 && (
              <a href={href(page - 1)} className="inline-flex min-h-11 items-center font-semibold">
                Newer
              </a>
            )}
            {page < pages && (
              <a href={href(page + 1)} className="inline-flex min-h-11 items-center font-semibold">
                Older
              </a>
            )}
          </nav>
        )}
      </main>
    </>
  );
}
