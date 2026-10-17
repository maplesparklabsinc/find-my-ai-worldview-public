// /admin/research, Research checks (PR #65 review): whether the method works and
// where the questions or scoring may need a look. Same gate as /admin
// (proxy.ts). Current content only. No email addresses and no free text. Copy
// here is founder-facing UI, not public site copy.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminHeader } from "@/components/admin-header";
import { EarlyNote, Fit, Health, Questions, RulesDepend, Setup, Tracks } from "@/components/admin-cards";
import { FEW, buildDashboard } from "@/lib/admin";
import { adminPassword } from "@/lib/admin/gate";
import { fitRows, parseHealthSort, questionHealth, setupCheck, sortHealth } from "@/lib/admin/insights";
import { contentVersions, getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { readAdmin, readAdminRows } from "@/lib/db/admin";

export const metadata: Metadata = {
  title: "Admin: research checks",
  robots: { index: false, follow: false },
};

export default function Page({ searchParams }: PageProps<"/admin/research">) {
  return (
    <div className="px-4 pb-16 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-[75rem] flex-col gap-8">
        <Suspense fallback={<p className="pt-6 text-ink-muted">Loading…</p>}>
          <Research searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Research({ searchParams }: Pick<PageProps<"/admin/research">, "searchParams">) {
  await connection();
  if (!adminPassword()) notFound();
  const params = await searchParams;
  const content = getContent();
  const copy = getCopy();
  const versions = contentVersions(content);
  const [raw, rows] = await Promise.all([readAdmin(versions), readAdminRows(versions)]);
  const d = buildDashboard(raw, content, copy, versions);
  const early = rows.length < FEW;
  const sort = parseHealthSort(params.qsort);
  const health = questionHealth(content, rows);

  return (
    <>
      <AdminHeader current="/admin/research">
        <span>Live content {d.versions}</span>
      </AdminHeader>

      <main className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-[2rem] leading-10 font-bold">Research checks</h1>
          <p className="max-w-[47.5rem] text-base text-ink-muted">
            Whether the method is working, and where questions or results may need a look. Current content only.
            {early ? "" : " Groups with fewer than 30 people are marked; read them lightly."}
          </p>
          {early && <EarlyNote />}
        </div>

        <Setup lines={setupCheck(content, copy, rows)} />
        <Health rows={sortHealth(health.statements, sort)} pairs={health.pairs} sort={sort} all={params.qall === "1"} early={early} />
        <Fit rows={fitRows(content, copy, rows)} early={early} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,28.75rem),1fr))] items-start gap-6">
          <Tracks d={d} early={early} />
          <Questions d={d} />
          <RulesDepend d={d} early={early} />
        </div>
      </main>
    </>
  );
}
