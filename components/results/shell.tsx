// Page frame for result pages: site name, single column, footer.
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { getCopy } from "@/lib/content/copy";

export function ResultShell({ children }: { children: React.ReactNode }) {
  const copy = getCopy();
  return (
    <div className="px-4 pt-2 pb-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-measure-body flex-col gap-10">
        <header className="flex min-h-14 items-center">
          <Link href="/" className="type-small font-bold text-ink no-underline">
            {copy.site.name}
          </Link>
        </header>
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}
