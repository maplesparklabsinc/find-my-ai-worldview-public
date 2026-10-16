// /admin/responses/{id} (issue #37): one response as stored, read under the
// content release it was scored with. Same gate as /admin (proxy.ts). No
// email, no free text (only whether there was one), no feedback text. Copy
// here is founder-facing UI, not public site copy.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { AdminHeader } from "@/components/admin-header";
import { versionsLine } from "@/lib/admin";
import { adminPassword } from "@/lib/admin/gate";
import { buildResponseDetail } from "@/lib/admin/responses";
import { contentVersions, getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { loadRelease } from "@/lib/content/release";
import { readResponse } from "@/lib/db/admin";
import { responseIdSchema } from "@/lib/submit";

export const metadata: Metadata = {
  title: "Admin: a response",
  robots: { index: false, follow: false },
};

export default function Page({ params }: PageProps<"/admin/responses/[id]">) {
  return (
    <div className="px-4 pb-16 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-[60rem] flex-col gap-8 wrap-anywhere">
        <Suspense fallback={<p className="pt-6 text-ink-muted">Loading…</p>}>
          <Response params={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function Response({ params }: Pick<PageProps<"/admin/responses/[id]">, "params">) {
  await connection();
  if (!adminPassword()) notFound();
  const { id } = await params;
  const raw = responseIdSchema.safeParse(id).success ? await readResponse(id) : null;
  const content = getContent();
  const header = (
    <AdminHeader current="/admin/responses">
      <span>Live content {versionsLine(contentVersions(content))}</span>
    </AdminHeader>
  );
  if (!raw) {
    return (
      <>
        {header}
        <main className="flex flex-col gap-4">
          <h1 className="text-[2rem] leading-10 font-bold">No response called &quot;{id}&quot;</h1>
          <Link href="/admin/responses">All responses</Link>
        </main>
      </>
    );
  }
  const release = await loadRelease({
    scoring: raw.scoring_version,
    taxonomy: raw.taxonomy_version,
    item_bank: raw.item_bank_version,
    narratives: raw.narratives_version,
  });
  const d = buildResponseDetail(raw, release?.content ?? content, getCopy());

  return (
    <>
      {header}
      <main className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Link href="/admin/responses" className="inline-flex min-h-11 items-center">
            All responses
          </Link>
          <h1 className="font-mono text-[1.75rem] leading-10 font-bold">{d.id}</h1>
          <p className="text-base text-ink-muted">Completed {d.date}</p>
          {!release && (
            <p role="status" className="rounded-md border-2 border-second bg-surface-raised p-3 font-semibold">
              This response&apos;s release was never frozen, so its questions are read with today&apos;s wording.
            </p>
          )}
        </div>

        <Card title="Result">
          <p className="text-xl font-bold">{d.outcome}</p>
          <table className="w-full max-w-[30rem] border-collapse text-left text-base">
            <thead>
              <tr className="border-b border-line text-sm text-ink-muted">
                <th scope="col" className="py-2 font-semibold">Perspective</th>
                <th scope="col" className="py-2 text-right font-semibold">Distance</th>
              </tr>
            </thead>
            <tbody>
              {d.ranked.map((r) => (
                <tr key={r.name} className="border-b border-line last:border-0">
                  <td className="py-2">{r.name}</td>
                  <td className="py-2 text-right tabular-nums">{r.distance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Before the result, and after">
          <Pairs
            rows={[
              { label: "Guess or quick check", value: d.guessOrCheck },
              ...d.fit,
            ]}
          />
        </Card>

        <Card title="How the quiz was shown">
          <Pairs
            rows={[
              ...d.versions,
              { label: "Answer direction", value: d.direction },
              { label: "Seed", value: d.seed },
            ]}
          />
        </Card>

        <Card title={`Answers (${d.answers.length})`}>
          <p className="text-sm text-ink-muted">In the item bank&apos;s order. The value is as stored; the label is the option the person tapped.</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-base">
              <thead>
                <tr className="border-b border-line text-sm text-ink-muted">
                  <th scope="col" className="py-2 pr-3 font-semibold">Item</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Statement</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Value</th>
                  <th scope="col" className="py-2 font-semibold">Label seen</th>
                </tr>
              </thead>
              <tbody>
                {d.answers.map((a) => (
                  <tr key={a.key} className="border-b border-line align-top last:border-0">
                    <td className="py-2 pr-3 font-mono text-sm whitespace-nowrap">{a.key}</td>
                    <td className="py-2 pr-3">{a.text}</td>
                    <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{a.value}</td>
                    <td className="py-2">{a.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-base">{d.freeText}</p>
        </Card>

        <Card title={`Skipped (${d.skipped.length})`}>
          {d.skipped.length === 0 ? (
            <p className="text-base">None.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-base">
              {d.skipped.map((s) => (
                <li key={s.key}>
                  <span className="font-mono text-sm">{s.key}</span> · {s.text}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-surface-raised p-4 sm:p-6">
      <h2 className="text-[1.375rem] leading-7 font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Pairs({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-ink-muted">{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
