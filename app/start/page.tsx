import type { Metadata } from "next";
import Link from "next/link";
import { BackIcon, LockIcon } from "@/components/icons";
import { Inline } from "@/components/markdown";
import { StartOrResume } from "@/components/resume";
import { LinkButton } from "@/components/ui";
import { getContent } from "@/lib/content";
import { getCopy, fill } from "@/lib/content/copy";
import { screenCount } from "@/lib/form";

export const metadata: Metadata = { title: "Before you start" };

export default function Start() {
  const copy = getCopy();
  const total = screenCount(getContent());
  return (
    <div className="flex min-h-dvh flex-col px-4 pt-2 pb-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-measure-body flex-1 flex-col gap-6">
        <header className="flex min-h-14 items-center gap-1">
          <Link href="/" aria-label="Back" className="-ml-3.5 flex size-12 items-center justify-center text-ink">
            <BackIcon />
          </Link>
          <span className="type-small font-bold">{copy.site.name}</span>
        </header>

        <h1 className="type-title">{copy.start.heading}</h1>
        <div className="flex flex-col gap-4">
          {copy.start.paragraphs.map((p) => (
            <p key={p}>
              <Inline text={p} />
            </p>
          ))}
        </div>
        <div className="flex items-start gap-3 rounded-md bg-accent-soft p-4">
          <LockIcon className="mt-0.5 flex-none text-accent" />
          <p className="type-small">
            <Inline text={copy.start.privacy_note} newTab />
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-4">
          <StartOrResume>
            <LinkButton href="/quiz">{copy.start.button}</LinkButton>
          </StartOrResume>
          <p className="text-center type-small text-ink-muted">{fill(copy.start.footnote, { n: total })}</p>
        </div>
      </div>
    </div>
  );
}
