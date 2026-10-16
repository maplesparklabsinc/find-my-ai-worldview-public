import Link from "next/link";
import { getCopy } from "@/lib/content/copy";
import { Inline } from "./markdown";

export function SiteFooter({ className = "" }: { className?: string }) {
  const copy = getCopy();
  return (
    <footer className={`flex flex-wrap items-center gap-x-6 type-small text-ink-muted [&_a]:text-ink-muted ${className}`}>
      <Link href="/privacy" className="flex min-h-tap-min items-center">
        Privacy
      </Link>
      <Link href="/changes" className="flex min-h-tap-min items-center">
        What&apos;s changed
      </Link>
      <Link href="/feedback" className="flex min-h-tap-min items-center">
        Tell us
      </Link>
      <span className="flex min-h-tap-min items-center gap-1">
        <Inline text={copy.footer.ai_disclosure} />
      </span>
      <span>{copy.site.maker}</span>
    </footer>
  );
}
