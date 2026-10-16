import { ResultShell } from "@/components/results/shell";
import { LinkButton } from "@/components/ui";
import { getCopy } from "@/lib/content/copy";

export default function NotFound() {
  const p = getCopy().result_page;
  return (
    <ResultShell>
      <main className="flex flex-col gap-6">
        <h1 className="type-title">{p.not_found_heading}</h1>
        <p>{p.not_found_body}</p>
        <LinkButton href="/">{p.take_it_button}</LinkButton>
      </main>
    </ResultShell>
  );
}
