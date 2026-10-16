import { getContent } from "@/lib/content";
import { fill } from "@/lib/content/copy";
import { screenCount } from "@/lib/form";

/** The quiz's commitment as a short list: "51 quick questions · Around 10 minutes · …". {n} is the screen count. */
export function Facts({ facts }: { facts: string[] }) {
  const n = screenCount(getContent());
  return (
    <ul className="flex flex-wrap gap-x-2 gap-y-1 type-small text-ink-muted">
      {facts.map((f, i) => (
        <li key={f} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden="true">·</span>}
          {fill(f, { n })}
        </li>
      ))}
    </ul>
  );
}
