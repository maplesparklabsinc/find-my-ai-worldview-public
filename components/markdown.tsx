// A deliberately small markdown renderer for our own copy in content/ (links,
// bold, italics, headings, paragraphs, lists). Not for untrusted input.
import Link from "next/link";
import type { ReactNode } from "react";

const INLINE = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g;

/** `newTab`: links open in a new tab, so the page they're on (such as /start) stays where it is. */
export function Inline({ text, newTab = false }: { text: string; newTab?: boolean }) {
  const parts = text.split(INLINE).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          const [, label, href] = link;
          if (newTab) {
            return (
              <a key={i} href={href} target="_blank" rel="noopener noreferrer">
                {label}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            );
          }
          return href.startsWith("/") ? (
            <Link key={i} href={href}>
              {label}
            </Link>
          ) : (
            <a key={i} href={href}>
              {label}
            </a>
          );
        }
        if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
        return part;
      })}
    </>
  );
}

/** Block-level rendering: "###" headings, "-" and "1." lists, paragraphs (single newlines become line breaks). */
export function Markdown({ source }: { source: string }) {
  const blocks = source.trim().split(/\n\s*\n/);
  const out: ReactNode[] = [];
  blocks.forEach((block, i) => {
    const lines = block.split("\n");
    const heading = /^(#{2,4})\s+(.*)$/.exec(lines[0]);
    if (heading && lines.length === 1) {
      const level = heading[1].length;
      out.push(
        level <= 3 ? (
          <h2 key={i} className="type-title mt-10 mb-4 first:mt-0">
            <Inline text={heading[2]} />
          </h2>
        ) : (
          <h3 key={i} className="type-body mt-6 mb-2 font-bold">
            <Inline text={heading[2]} />
          </h3>
        ),
      );
    } else if (lines.every((l) => /^- /.test(l))) {
      out.push(
        <ul key={i} className="mb-4 list-disc space-y-2 pl-6">
          {lines.map((l, j) => (
            <li key={j}>
              <Inline text={l.slice(2)} />
            </li>
          ))}
        </ul>,
      );
    } else if (lines.every((l) => /^\d+\. /.test(l))) {
      out.push(
        <ol key={i} className="mb-4 list-decimal space-y-2 pl-6">
          {lines.map((l, j) => (
            <li key={j}>
              <Inline text={l.replace(/^\d+\. /, "")} />
            </li>
          ))}
        </ol>,
      );
    } else {
      out.push(
        <p key={i} className="mb-4">
          {lines.map((l, j) => (
            <span key={j}>
              {j > 0 && <br />}
              <Inline text={l} />
            </span>
          ))}
        </p>,
      );
    }
  });
  // Long tokens (an email address, a URL) may break anywhere rather than push
  // the page wider than a 320px screen.
  return <div className="[overflow-wrap:anywhere]">{out}</div>;
}
