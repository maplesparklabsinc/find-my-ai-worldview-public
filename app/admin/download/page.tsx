// /admin/download (issue #55, section 1): the form for the anonymous data
// download, which /admin/export builds. Same gate as /admin (proxy.ts). Copy
// here is founder-facing UI, not public site copy.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminHeader } from "@/components/admin-header";
import { versionsLine } from "@/lib/admin";
import { adminPassword } from "@/lib/admin/gate";
import { contentVersions, getContent } from "@/lib/content";
import { releaseKey, releaseKeys } from "@/lib/content/release";

export const metadata: Metadata = {
  title: "Admin: download data",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="px-4 pb-16 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-[60rem] flex-col gap-8">
        <Suspense fallback={<p className="pt-6 text-ink-muted">Loading…</p>}>
          <Download />
        </Suspense>
      </div>
    </div>
  );
}

const field = "min-h-11 max-w-full rounded-sm border border-line-strong bg-surface-raised px-3 text-base text-ink";
const label = "flex max-w-full flex-col gap-1 text-sm font-semibold";

async function Download() {
  await connection();
  if (!adminPassword()) notFound();
  const versions = contentVersions(getContent());
  const current = releaseKey(versions);
  // Newest first, the current release even if it was never frozen.
  const releases = [...new Set([current, ...(await releaseKeys()).reverse()])];

  return (
    <>
      <AdminHeader current="/admin/download">
        <span>Live content {versionsLine(versions)}</span>
      </AdminHeader>

      <main className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[2rem] leading-10 font-bold">Download data</h1>
          <p className="max-w-[47.5rem] text-base text-ink-muted">
            One zip, built when you ask and never stored, to read or to give to Claude with your questions.
          </p>
        </div>

        <section aria-labelledby="whats-in-it" className="flex flex-col gap-3 rounded-md border border-line bg-surface-raised p-4 text-base sm:p-6">
          <h2 id="whats-in-it" className="text-[1.375rem] leading-7 font-bold">
            What&apos;s in it
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>responses.csv: one row per completed quiz, with every answer, the result, the theme bands and the quality flags.</li>
            <li>feedback.csv: one row per feedback entry.</li>
            <li>README.txt: what each column means.</li>
          </ul>
          <p className="text-sm text-ink-muted">
            Anonymous: no email addresses (any typed into free text or feedback are replaced), and themes as bands, never
            scores. Research sign-ups show only as yes, withdrawn or no. A copy for reading and analysis only.
          </p>
        </section>

        <form method="get" action="/admin/export" className="flex flex-wrap items-end gap-4">
          <label className={label}>
            Content release
            <select name="release" defaultValue="" className={field}>
              <option value="">All releases</option>
              {releases.map((k) => (
                <option key={k} value={k}>
                  {k}
                  {k === current && " (current)"}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            From (optional)
            <input type="date" name="from" className={field} />
          </label>
          <label className={label}>
            To (optional)
            <input type="date" name="to" className={field} />
          </label>
          <button type="submit" className="min-h-11 rounded-md border border-line-strong bg-surface-raised px-4 font-semibold">
            Download data
          </button>
        </form>
      </main>
    </>
  );
}
