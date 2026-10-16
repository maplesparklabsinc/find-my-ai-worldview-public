"use client";

// The "Tell us" form (docs/04 section 7). Opened from a result page, it offers
// "Attach my result", off by default; the result ID is sent only if ticked.
import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";
import { Inline } from "@/components/markdown";
import { Button } from "@/components/ui";
import { track } from "@/lib/analytics";
import { getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { EDIT_TOKEN_HEADER } from "@/lib/edit-token/header";
import { editToken } from "@/lib/quiz";

const noop = () => () => {};
const field = "w-full rounded-sm border border-line-strong bg-surface-raised px-3 py-2 text-ink";

function useQuery(name: string): string | null {
  return useSyncExternalStore(noop, () => new URLSearchParams(window.location.search).get(name), () => null);
}

/** Match "which question or perspective" to a perspective name or item ID, if it is one. */
function targets(text: string): { item_ids: string[]; perspective_ids: string[] } {
  const t = text.trim().toLowerCase();
  const c = getContent();
  const p = c.perspectives.perspectives.find((x) => x.name.toLowerCase() === t || x.id === t);
  const item = c.itemsById.get(text.trim().toUpperCase());
  return { item_ids: item ? [item.id] : [], perspective_ids: p ? [p.id] : [] };
}

export function FeedbackForm() {
  const f = getCopy().feedback;
  const resultId = useQuery("result");
  const ids = { problem: useId(), target: useId(), details: useId(), evidence: useId(), email: useId(), quote: useId(), attach: useId() };
  const [type, setType] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [details, setDetails] = useState("");
  const [evidence, setEvidence] = useState("");
  const [email, setEmail] = useState("");
  const [quote, setQuote] = useState(false);
  const [attach, setAttach] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !details.trim()) return;
    setState("busy");
    const body = target.trim() ? `${target.trim()}\n\n${details.trim()}` : details.trim();
    // The edit token, if this browser saved the attached result, marks the attachment as theirs.
    const token = attach && resultId ? editToken(resultId) : null;
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { [EDIT_TOKEN_HEADER]: token } : {}) },
        body: JSON.stringify({
          type,
          ...targets(target),
          body,
          evidence: evidence.trim() || undefined,
          email: email.trim() || undefined,
          may_quote: quote,
          response_id: attach && resultId ? resultId : undefined,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      track("feedback_sent");
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div role="status" className="flex flex-col gap-4">
        <h2 className="type-title">{f.thanks_heading}</h2>
        <p>
          <Inline text={f.thanks} />
        </p>
        {resultId && (
          <Link href={`/r/${resultId}`} className="flex min-h-tap-min items-center">
            {f.back_to_result}
          </Link>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend id={ids.problem} className="mb-2 font-semibold">
          {f.problem_label}
        </legend>
        {f.problem_options.map((o) => (
          <label
            key={o.id}
            className="flex min-h-tap-option cursor-pointer items-center gap-3 rounded-md border border-line-strong bg-surface-raised px-4 has-checked:border-2 has-checked:border-accent has-checked:bg-accent-soft has-checked:font-bold"
          >
            <input type="radio" name="problem" value={o.id} required checked={type === o.id} onChange={() => setType(o.id)} className="size-5 accent-accent" />
            {o.label}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.target} className="font-semibold">
          {f.target_label}
        </label>
        <input id={ids.target} className={`${field} min-h-tap-min`} value={target} maxLength={200} onChange={(e) => setTarget(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.details} className="font-semibold">
          {f.details_label}
        </label>
        <textarea id={ids.details} required rows={5} maxLength={4500} className={field} value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.evidence} className="font-semibold">
          {f.evidence_label}
        </label>
        <textarea id={ids.evidence} rows={2} maxLength={2000} className={field} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.email} className="font-semibold">
          {f.email_label}
        </label>
        <input id={ids.email} type="email" autoComplete="email" className={`${field} min-h-tap-min`} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <input id={ids.quote} type="checkbox" checked={quote} onChange={(e) => setQuote(e.target.checked)} className="mt-1 size-6 flex-none accent-accent" />
          <label htmlFor={ids.quote}>{f.quote_consent}</label>
        </div>
        {resultId && (
          <div className="flex items-start gap-3">
            <input id={ids.attach} type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="mt-1 size-6 flex-none accent-accent" />
            <label htmlFor={ids.attach}>{f.attach_result}</label>
          </div>
        )}
      </div>

      <Button type="submit" disabled={!type || !details.trim() || state === "busy"}>
        {f.button}
      </Button>
      {state === "error" && (
        <p role="alert" className="type-small">
          {f.error}
        </p>
      )}
    </form>
  );
}
