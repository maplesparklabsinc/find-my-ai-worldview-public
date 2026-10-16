// A compare link, /c/{id} (docs/01-product-spec.md 4 and 5.8), from before
// issue #37: the landing page for a friend. New invitations come from the
// shared result link (/r/{id}); these keep working. No names.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Facts } from "@/components/facts";
import { AcceptInvite } from "@/components/results/invite";
import { ResultShell } from "@/components/results/shell";
import { getCopy } from "@/lib/content/copy";
import { loadResponse } from "@/lib/stored";

// A missing result: notFound() here, before the page streams, gives a real 404
// (metadata blocks for every user agent: htmlLimitedBots in next.config.ts).
export async function generateMetadata({ params }: PageProps<"/c/[id]">): Promise<Metadata> {
  if (!(await loadResponse((await params).id))) notFound();
  const copy = getCopy();
  return {
    title: copy.compare.heading,
    description: copy.landing.lede,
    robots: { index: false },
    openGraph: { title: copy.landing.headline, description: copy.compare.invite_anonymous },
  };
}

export default function Page({ params }: PageProps<"/c/[id]">) {
  return (
    <ResultShell>
      <Suspense fallback={<main aria-busy="true" className="h-60 animate-pulse rounded-md bg-accent-soft motion-reduce:animate-none" />}>
        <Invite params={params} />
      </Suspense>
    </ResultShell>
  );
}

async function Invite({ params }: Pick<PageProps<"/c/[id]">, "params">) {
  const { id } = await params;
  const row = await loadResponse(id);
  if (!row) notFound();
  const copy = getCopy();
  const c = copy.compare;
  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-md bg-accent-soft px-4 py-6">
        <p className="font-semibold">{c.invite_anonymous}</p>
      </div>
      <h1 className="type-display">{copy.landing.headline}</h1>
      <p>{copy.landing.lede}</p>
      <Facts facts={copy.landing.facts} />
      <AcceptInvite id={id} label={c.invite_button} />
    </main>
  );
}
