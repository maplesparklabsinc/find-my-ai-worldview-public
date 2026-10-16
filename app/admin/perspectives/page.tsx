// /admin/perspectives (issue #16): the full write-up of every perspective,
// exactly as the site uses it, rendered straight from the content files so it
// can't go stale. Same gate as /admin (proxy.ts). ?release=<key> shows a frozen
// release instead, as people saw it at the time. Copy here is founder-facing
// UI, not public site copy.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { AdminHeader } from "@/components/admin-header";
import { Inline } from "@/components/markdown";
import { adminPassword } from "@/lib/admin/gate";
import { versionsLine } from "@/lib/admin";
import {
  buildPerspectivesReference,
  newestChange,
  type PerspectiveEntry,
  type PerspectivesReference,
  type Source,
} from "@/lib/admin/perspectives";
import { contentVersions, getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { loadReleaseByKey, releaseKey, releaseKeys } from "@/lib/content/release";

export const metadata: Metadata = {
  title: "Admin: perspectives",
  robots: { index: false, follow: false },
};

export default function Page({ searchParams }: PageProps<"/admin/perspectives">) {
  return (
    <div className="px-4 pb-16 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-[60rem] flex-col gap-8 wrap-anywhere">
        <Suspense fallback={<p className="pt-6 text-ink-muted">Loading…</p>}>
          <Perspectives searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Perspectives({ searchParams }: Pick<PageProps<"/admin/perspectives">, "searchParams">) {
  await connection();
  if (!adminPassword()) notFound();
  const wanted = (await searchParams).release;
  const content = getContent();
  const copy = getCopy();
  const currentKey = releaseKey(contentVersions(content));

  // An unknown release shows the current content with a notice. (The page
  // streams, so it couldn't be a 404 by then anyway.)
  const release = typeof wanted === "string" && wanted !== "" ? await loadReleaseByKey(wanted) : null;
  const unknown = typeof wanted === "string" && wanted !== "" && !release;
  const selected = release?.key ?? null;
  const d: PerspectivesReference = release
    ? buildPerspectivesReference(release.content, release.copy, content)
    : buildPerspectivesReference(content, copy);
  // Newest first.
  const keys = (await releaseKeys()).reverse();

  return (
    <>
      <AdminHeader current="/admin/perspectives">
        <span>Live content {versionsLine(contentVersions(content))}</span>
      </AdminHeader>

      <main className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h1 className="text-[2rem] leading-10 font-bold">Perspectives</h1>
          <p className="text-base text-ink-muted">
            Every perspective as the site words it, read straight from the content files. Edit the content, not this page.
          </p>
          {unknown && (
            <p role="status" className="rounded-md border-2 border-second bg-surface-raised p-3 font-semibold">
              There&apos;s no frozen release called &quot;{wanted}&quot;. Showing the current content; pick a version below.
            </p>
          )}
          {selected && (
            <p className="rounded-md border-2 border-second bg-surface-raised p-3 font-semibold">
              Showing an older release ({selected}), as people saw it then. Perspectives whose name, tagline or
              description differ from today are marked.
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
            <dt className="text-ink-muted">Taxonomy</dt>
            <dd>{d.taxonomy}</dd>
            <dt className="text-ink-muted">Narratives</dt>
            <dd>{d.narratives}</dd>
            <dt className="text-ink-muted">All versions</dt>
            <dd>{d.versions}</dd>
            <dt className="text-ink-muted">Newest /changes entry</dt>
            <dd>
              <a href="/changes">{newestChange(copy)}</a>
            </dd>
            <dt className="text-ink-muted">Status</dt>
            <dd>{d.status}</dd>
          </dl>
        </div>

        <nav aria-label="Content version" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink-muted">Content version</h2>
          <ul className="flex flex-wrap gap-2">
            <li>
              <VersionLink href="/admin/perspectives" current={selected === null}>
                Current
              </VersionLink>
            </li>
            {keys.map((k) => (
              <li key={k}>
                <VersionLink href={`/admin/perspectives?release=${encodeURIComponent(k)}`} current={selected === k}>
                  {k}
                  {k === currentKey && " (same as current)"}
                </VersionLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Jump to a perspective" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink-muted">Jump to</h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {d.perspectives.map((p) => (
              <li key={p.id}>
                <a href={`#${p.id}`} className="inline-flex min-h-11 items-center">
                  {p.name}
                </a>
              </li>
            ))}
            <li>
              <a href="#other-results" className="inline-flex min-h-11 items-center">
                Other results
              </a>
            </li>
            <li>
              <a href="#wording" className="inline-flex min-h-11 items-center">
                Other wording
              </a>
            </li>
            <li>
              <a href="#candidates" className="inline-flex min-h-11 items-center">
                Candidates
              </a>
            </li>
          </ul>
        </nav>

        {d.perspectives.map((p) => (
          <PerspectiveCard key={p.id} p={p} />
        ))}

        <Card id="other-results" title="Other results">
          <Note>The results that aren&apos;t one of the perspectives. Words in braces are filled in on the result page.</Note>
          {d.outcomes.map((o) => (
            <section key={o.id} aria-labelledby={`outcome-${o.id}`} className="flex flex-col gap-3 border-t border-line pt-4">
              <h3 id={`outcome-${o.id}`} className="text-[1.0625rem] leading-6 font-bold">
                {o.label}
              </h3>
              <dl className="flex flex-col gap-3">
                {o.fields.map((f) => (
                  <div key={f.key}>
                    <dt className="text-sm font-semibold text-ink-muted">{f.label}</dt>
                    <dd>{f.text}</dd>
                  </div>
                ))}
              </dl>
              {o.sources.length > 0 && <Sources sources={o.sources} />}
            </section>
          ))}
        </Card>

        <Card id="wording" title="Other wording">
          <Note>
            The rest of the result-page wording in the narratives file, keyed by where it sits in the file. Words in
            braces are filled in on the result page.
          </Note>
          {d.wording.map((w) => (
            <section key={w.id} aria-labelledby={`wording-${w.id}`} className="flex flex-col gap-3 border-t border-line pt-4">
              <h3 id={`wording-${w.id}`} className="text-[1.0625rem] leading-6 font-bold">
                {w.title}
              </h3>
              <dl className="flex flex-col gap-3">
                {w.items.map((x) => (
                  <div key={x.key}>
                    {x.key && <dt className="text-sm font-semibold text-ink-muted">{x.key}</dt>}
                    <dd>{x.text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </Card>

        <Card id="candidates" title="Candidates not scored yet">
          <Note>Not in the quiz. Nobody can get these as a result.</Note>
          {d.candidates.length === 0 ? (
            <p className="text-ink-muted">None.</p>
          ) : (
            <ul className="flex flex-col">
              {d.candidates.map((x) => (
                <li key={x.id} className="flex flex-col gap-1 border-b border-line py-3">
                  <span className="font-semibold">
                    {x.name} <span className="font-normal text-ink-muted">· not in the quiz</span>
                  </span>
                  <span>{x.note}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {d.notes && <Note>About the numbers in the scoring details: {d.notes}</Note>}
      </main>
    </>
  );
}

function VersionLink({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      aria-current={current ? "page" : undefined}
      className="inline-flex min-h-11 items-center rounded-pill border border-line-strong px-3 text-sm font-semibold no-underline aria-[current=page]:border-2 aria-[current=page]:border-accent aria-[current=page]:bg-accent-soft aria-[current=page]:text-ink"
    >
      {children}
    </a>
  );
}

function Card({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 scroll-mt-4 flex-col gap-4 rounded-md border border-line bg-surface-raised p-4 text-base sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-[1.375rem] leading-7 font-bold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>;
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="text-[1.0625rem] leading-6 font-bold">{children}</h3>;
}

function Sources({ sources }: { sources: Source[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm text-ink-muted">
      {sources.map((s) => (
        <li key={s.ref}>
          <span className="font-semibold">{s.ref}</span>: {s.line ?? "no source line in copy.json for this reference"}
        </li>
      ))}
    </ul>
  );
}

function Changed({ changed }: { changed: PerspectiveEntry["changed"] }) {
  if (changed === null || (Array.isArray(changed) && changed.length === 0)) return null;
  const text = changed === "not current" ? "Not in the current content" : `Differs from today: ${changed.join(", ")}`;
  return (
    <p className="w-fit rounded-pill border-2 border-second px-2 py-0.5 text-sm font-semibold">{text}</p>
  );
}

function PerspectiveCard({ p }: { p: PerspectiveEntry }) {
  return (
    <Card
      id={p.id}
      title={p.name}
      aside={
        <>
          <p className="text-[1.0625rem] italic">{p.tagline}</p>
          {p.cardSummary && (
            <p className="text-[1.0625rem]">
              <span className="font-semibold">On the share image: </span>
              {p.cardSummary}
            </p>
          )}
          <Changed changed={p.changed} />
        </>
      }
    >
      <p>{p.description}</p>

      <div className="flex flex-col gap-1">
        <Heading>The strongest objection to this view</Heading>
        <p>{p.strongestObjection ?? <span className="text-ink-muted">Not in this release.</span>}</p>
      </div>

      <div className="flex flex-col gap-1">
        <Heading>Something to talk about</Heading>
        <p>{p.discussionPrompt ?? <span className="text-ink-muted">Not in this release.</span>}</p>
      </div>

      <div className="flex flex-col gap-1">
        <Heading>Elsewhere you might hear</Heading>
        <p>{p.elsewhere ? <Inline text={p.elsewhere} /> : <span className="text-ink-muted">Not in this release.</span>}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Heading>Typical position on the six questions</Heading>
        <ul className="flex flex-col">
          {p.positions.map((x) => (
            <li key={x.construct} className="flex flex-col gap-0.5 border-b border-line py-2.5">
              <span className="font-semibold">{x.question}</span>
              <span>{x.band}</span>
              <span className="text-sm text-ink-muted">Counts for this perspective: {x.weight}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <Heading>Signature statements</Heading>
        <ul className="flex flex-col">
          {p.signatures.map((s) => (
            <li key={s.item} className="flex flex-wrap gap-x-3 border-b border-line py-2.5">
              <span className="w-20 flex-none font-semibold">{s.direction}</span>
              <span className="min-w-[min(100%,12rem)] flex-1">{s.text}</span>
              <span className="flex-none text-sm text-ink-muted">{s.item}</span>
            </li>
          ))}
        </ul>
      </div>

      {p.evidence.length > 0 && (
        <div className="flex flex-col gap-1">
          <Heading>Evidence</Heading>
          <Sources sources={p.evidence} />
        </div>
      )}

      <details className="rounded-md border border-line p-3">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">Scoring details</summary>
        <div role="region" aria-label={`Scoring details for ${p.name}`} tabIndex={0} className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-base [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold [&_th]:text-ink-muted">
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col" className="text-right!">
                  Prototype
                </th>
                <th scope="col" className="text-right!">
                  Weight
                </th>
              </tr>
            </thead>
            <tbody>
              {p.positions.map((x) => (
                <tr key={x.construct}>
                  <th scope="row" className="font-normal! text-ink!">
                    {x.construct} <span className="text-ink-muted">· {x.question}</span>
                  </th>
                  <td className="text-right tabular-nums">{x.rawPrototype}</td>
                  <td className="text-right tabular-nums">{x.rawWeight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
