"use client";

// The interactive parts of a stored result page (docs/01-product-spec.md 5.6 to
// 5.8, issues #28 and #37): "does this fit you?", the share box, the research
// email, the Go deeper rows, and for visitors the invitation to take the quiz
// and compare. Anyone with the link sees the same result; the controls that
// change it (fit, email) show only in the browser that saved it.
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { CheckIcon, ChevronIcon, CopyIcon, ShareIcon } from "@/components/icons";
import { Inline } from "@/components/markdown";
import { Button, LinkButton, OptionButton, Track } from "@/components/ui";
import { track } from "@/lib/analytics";
import { fill, getCopy } from "@/lib/content/copy";
import { getContent } from "@/lib/content";
import { screenCount } from "@/lib/form";
import { EDIT_TOKEN_HEADER } from "@/lib/edit-token/header";
import { reflectionText, type Prediction } from "@/lib/prediction";
import {
  clearQuiz,
  editToken,
  isMine,
  loadFeedbackGiven,
  loadPredictionNote,
  loadQuickCheckNote,
  saveCompareWith,
  saveFeedbackGiven,
  type FeedbackGiven,
} from "@/lib/quiz";
import { sharedResultPath } from "@/lib/results";
import type { Outcome } from "@/lib/scoring";
import { text as size } from "./type";

// ---------- Ownership ----------

const noop = () => () => {};

/** Set on the shared link (?view=shared): everyone, the owner included, gets the read-only visitor view. */
const ReadOnly = createContext(false);

export function ReadOnlyView({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <ReadOnly value={on}>{children}</ReadOnly>;
}

/**
 * Whose result this is: "unknown" on the server and while the page hydrates,
 * then "mine" in the browser that saved it, or "theirs". The shared link
 * (read-only) is always "theirs", even on the server.
 */
function useOwnership(id: string): "unknown" | "mine" | "theirs" {
  const readOnly = useContext(ReadOnly);
  const known = useSyncExternalStore(noop, () => true, () => false);
  const mine = useSyncExternalStore(noop, () => isMine(id), () => false);
  if (readOnly) return "theirs";
  if (!known) return "unknown";
  return mine ? "mine" : "theirs";
}

/** True once mounted in the browser that saved this result, unless the page is the read-only shared view. */
export function useIsMine(id: string): boolean {
  return useOwnership(id) === "mine";
}

/**
 * The owner's parts, or `otherwise` for anyone else. Neither shows until
 * ownership is known, so the visitor's banner and invitation never flash on
 * the owner's page when it loads (issue #37).
 */
export function OwnerOnly({ id, children, otherwise = null }: { id: string; children: React.ReactNode; otherwise?: React.ReactNode }) {
  const who = useOwnership(id);
  return who === "unknown" ? null : who === "mine" ? children : otherwise;
}

function useOrigin(): string {
  return useSyncExternalStore(noop, () => window.location.origin, () => "");
}

// ---------- Small pieces ----------

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="type-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

const inputClass =
  "min-h-tap-min w-full rounded-sm border border-line-strong bg-surface-raised px-3 py-2 text-ink placeholder:text-ink-muted";

/** Send a change to a saved result, with this browser's edit token for it. */
async function send(url: string, method: "POST" | "PATCH", body: unknown, resultId: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = editToken(resultId);
    if (token) headers[EDIT_TOKEN_HEADER] = token;
    const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------- Quick-check note ----------

/**
 * After a quick check: which description the person rated (docs/04 section 6).
 * A small muted line at the end of the fit questions (issue #37).
 */
export function QuickCheckNote({ id }: { id: string }) {
  const qc = getCopy().quick_check;
  const shown = useSyncExternalStore(noop, () => loadQuickCheckNote(id), () => null);
  if (shown !== "own" && shown !== "other") return null;
  return <p className={`${size.note} text-ink-muted`}>{fill(qc.result_note, { which: shown === "own" ? qc.which_own : qc.which_other })}</p>;
}

// ---------- The guess beside the result ----------

/**
 * What the person guessed before seeing the result, set beside it (issue #24).
 * Never says right or wrong. Not a live region: it is part of the page as it
 * loads, not an announcement.
 */
export function Reflection({ prediction, outcome }: { prediction: Prediction; outcome: Outcome }) {
  const copy = getCopy();
  const text = reflectionText(getContent(), copy, prediction, outcome);
  if (!text) return null;
  return (
    <Block title={copy.reflection.heading}>
      <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-raised p-4">
        <p>
          <Inline text={text} />
        </p>
        <p className="text-ink-muted">{copy.reflection.prompt}</p>
      </div>
    </Block>
  );
}

/** The owner's guess for a saved result, kept only in the browser that made it. */
export function PredictionReflection({ id, outcome }: { id: string; outcome: Outcome }) {
  const raw = useSyncExternalStore(noop, () => JSON.stringify(loadPredictionNote(id)), () => "null");
  const prediction = JSON.parse(raw) as Prediction | null;
  return prediction ? <Reflection prediction={prediction} outcome={outcome} /> : null;
}

// ---------- Share ----------

/**
 * Copy text without the Clipboard API, which needs HTTPS or localhost (a phone
 * testing over plain http has none). Returns false if the browser refused.
 */
function copyWithTextarea(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  const active = document.activeElement as HTMLElement | null;
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  active?.focus();
  return ok;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused (permissions, insecure page): try the older way.
  }
  return copyWithTextarea(text);
}

/**
 * One button (issue #37): "Share" opens the device's own share menu where there
 * is one (mostly phones), with the title, text and link but no image file,
 * since several apps drop the link when a file is attached. Elsewhere "Copy
 * link", which copies the link only.
 */
export function ShareLink({ path, text }: { path: string; text: string }) {
  const s = getCopy().share;
  const site = getCopy().site.name;
  const origin = useOrigin();
  const url = `${origin}${path}`;
  const native = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
  const [copied, setCopied] = useState(false);
  // Shown when the browser won't copy at all: the link, selected, to copy by hand (issue #26). Never a prompt dialog.
  const [manual, setManual] = useState(false);
  const manualField = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (manual) manualField.current?.select();
  }, [manual]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Counted only once the share menu or clipboard reports success, so a
  // cancelled or failed share isn't counted (issue #18).
  async function share() {
    if (native) {
      try {
        await navigator.share({ title: site, text, url });
        track("result_shared", { channel: "native" });
      } catch {
        // Closing the share menu is not an error.
      }
      return;
    }
    if (await copyText(url)) {
      track("result_shared", { channel: "copy" });
      setManual(false);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 3000);
    } else {
      setManual(true);
      manualField.current?.select();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={() => void share()}>
        {native ? <ShareIcon className="mr-2 flex-none" /> : copied ? <CheckIcon className="mr-2 flex-none" /> : <CopyIcon className="mr-2 flex-none" />}
        {native ? s.share_button : copied ? s.copied : s.copy_link}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? s.copied : ""}
      </span>
      {manual && (
        <input
          ref={manualField}
          type="text"
          readOnly
          value={url}
          aria-label={s.copy_link}
          onFocus={(e) => e.currentTarget.select()}
          className={inputClass}
        />
      )}
    </div>
  );
}

/**
 * "Share your result" (issue #37): who can see a shared link, one share button,
 * and the share image as a thumbnail with "Download image". The link preview
 * shows the same card (the page's og:image).
 */
export function ShareBox({ id, text, imageAlt }: { id: string; text: string; imageAlt: string }) {
  const s = getCopy().share;
  const image = `/r/${id}/image`;
  const counted = () => track("result_shared", { channel: "image" });
  return (
    <Block title={s.heading}>
      <p className={size.card}>{s.note}</p>
      <ShareLink path={sharedResultPath(id)} text={text} />
      <div className="flex flex-col items-start gap-1">
        <a href={image} download onClick={counted} className="block w-full max-w-80 rounded-md border border-line">
          {/* A plain img: the card is a generated PNG from this site, not something to optimize. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={imageAlt} width={1080} height={1080} className="block h-auto w-full rounded-md" />
        </a>
        <a href={image} download onClick={counted} className="flex min-h-tap-min items-center">
          {s.download_image}
        </a>
      </div>
    </Block>
  );
}

/** On a friend's comparison: share it back to the person who sent the link. */
export function SendBack({ id, vs, name }: { id: string; vs: string; name: string }) {
  const c = getCopy().compare;
  const site = getCopy().site.name;
  return (
    <Block title={fill(c.send_back_button, { name })}>
      <ShareLink path={`/r/${id}?vs=${vs}`} text={fill(c.send_back_text, { site })} />
    </Block>
  );
}

// ---------- Help us get this right ----------

export interface FeedbackTrack {
  construct: string;
  question: string;
  low: string;
  high: string;
  position: number;
  bandText: string;
}

export interface FeedbackPerspective {
  id: string;
  name: string;
  tagline: string;
}

// The fit rating is given in the card near the top and read by the "Help us
// get this right" row further down, which asks "Which fits you better?" after
// a low rating. Both read what this browser saved; this tells the row to look again.
const fitListeners = new Set<() => void>();
function subscribeFit(listener: () => void) {
  fitListeners.add(listener);
  return () => void fitListeners.delete(listener);
}

/** "Does this fit you?", one tap, near the top of the owner's result (issue #28). Saved as soon as it is tapped. */
export function FitCard({ id }: { id: string }) {
  const f = getCopy().fit;
  const headingId = useId();
  // Rendered only in the browser that saved the result (OwnerOnly), so reading
  // what it saved before is safe on first render.
  const [fit, setFit] = useState<number | null>(() => loadFeedbackGiven(id).fit_rating ?? null);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function rate(rating: number) {
    const before = fit;
    setFit(rating);
    if (await send(`/api/responses/${id}`, "PATCH", { fit_rating: rating }, id)) {
      saveFeedbackGiven(id, { fit_rating: rating });
      fitListeners.forEach((l) => l());
      setStatus("saved");
    } else {
      // Un-highlight, so it doesn't look saved.
      setFit((now) => (now === rating ? before : now));
      setStatus("error");
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-md border border-line bg-surface-raised px-4 py-5">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className={`${size.heading} font-bold`}>
          {f.heading}
        </h2>
        <p className={`${size.note} text-ink-muted`}>{f.quick_note}</p>
      </div>
      <div role="group" aria-labelledby={headingId} className="flex flex-wrap gap-2">
        {f.options.map((label, i) => {
          const selected = fit === i + 1;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={selected}
              onClick={() => void rate(i + 1)}
              className={`min-h-12 rounded-pill px-4 ${size.row} text-ink ${
                selected ? "border-2 border-accent bg-accent-soft px-[15px] font-bold" : "border border-line-strong bg-surface-raised font-medium"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p role="status" className={status === "error" ? "font-semibold" : "type-small"}>
        {status === "saved" ? f.quick_thanks : status === "error" ? f.error : ""}
      </p>
      <QuickCheckNote id={id} />
    </section>
  );
}

/**
 * The rest of the result feedback, in the "Help us get this right" row
 * (docs/01-product-spec.md 5.6): "Which fits you better?" after a low fit
 * rating, "Check your six answers" (collapsed) and "Something off? Tell us".
 * Each answer is saved as soon as it is given.
 */
export function HelpUs({ id, others, tracks }: { id: string; others: FeedbackPerspective[]; tracks: FeedbackTrack[] }) {
  const f = getCopy().fit;
  const fit = useSyncExternalStore(subscribeFit, () => loadFeedbackGiven(id).fit_rating ?? null, () => null);
  // Rendered only in the browser that saved the result (OwnerOnly), so reading
  // what it saved before is safe on first render.
  const [given] = useState(() => loadFeedbackGiven(id));
  const [better, setBetter] = useState<string | null>(given.better_fit ?? null);
  const [checks, setChecks] = useState<Record<string, string>>(given.track_checks ?? {});
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  /** Save one answer; if the server doesn't take it, `undo` clears the choice so it doesn't look saved. */
  async function save(patch: FeedbackGiven, undo: () => void) {
    if (await send(`/api/responses/${id}`, "PATCH", patch, id)) {
      saveFeedbackGiven(id, patch);
      setStatus("saved");
    } else {
      undo();
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className={`${size.card} text-ink-muted`}>{f.section_body}</p>

      {fit !== null && fit <= 3 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-bold">{f.better_heading}</legend>
          {[...others.map((p) => ({ id: p.id, label: p.name, hint: p.tagline })), { id: "none", label: f.better_none, hint: "" }, { id: "own_mix", label: f.better_own_mix, hint: "" }].map(
            (o) => (
              <OptionButton
                key={o.id}
                tall={!!o.hint}
                selected={better === o.id}
                onClick={() => {
                  const before = better;
                  setBetter(o.id);
                  void save({ better_fit: o.id }, () => setBetter((now) => (now === o.id ? before : now)));
                }}
              >
                <span className="flex flex-col">
                  <span>{o.label}</span>
                  {o.hint && <span className="type-small font-normal text-ink-muted">{o.hint}</span>}
                </span>
              </OptionButton>
            ),
          )}
        </fieldset>
      )}

      {tracks.length > 0 && (
        <details className="rounded-md border border-line bg-surface-raised px-4">
          <summary className="flex min-h-tap-min cursor-pointer items-center font-bold">{f.check_heading}</summary>
          <div className="flex flex-col gap-8 pt-2 pb-6">
            {tracks.map((t) => (
              <fieldset key={t.construct} className="flex flex-col gap-2">
                <legend className="mb-1 font-semibold">{t.question}</legend>
                <Track label={t.bandText} low={t.low} high={t.high} markers={[{ position: t.position, kind: "you" }]} />
                <p className="type-small text-ink-muted">{f.check_question}</p>
                {(
                  [
                    ["about_right", f.check_about_right],
                    ["further_low", fill(f.check_further, { end: t.low })],
                    ["further_high", fill(f.check_further, { end: t.high })],
                  ] as const
                ).map(([value, label]) => (
                  <OptionButton
                    key={value}
                    selected={checks[t.construct] === value}
                    onClick={() => {
                      const before = checks[t.construct];
                      setChecks((x) => ({ ...x, [t.construct]: value }));
                      void save({ track_checks: { [t.construct]: value } }, () =>
                        setChecks((x) => {
                          if (x[t.construct] !== value) return x;
                          const rest = Object.fromEntries(Object.entries(x).filter(([k]) => k !== t.construct));
                          return before === undefined ? rest : { ...rest, [t.construct]: before };
                        }),
                      );
                    }}
                  >
                    {label}
                  </OptionButton>
                ))}
              </fieldset>
            ))}
          </div>
        </details>
      )}

      <p aria-live="polite" className={status === "error" ? "font-semibold" : "type-small text-ink-muted"}>
        {status === "saved" ? f.thanks : status === "error" ? f.error : ""}
      </p>
      <p>
        <Inline text={fill(f.something_off, { feedback_link: `/feedback?result=${id}` })} />
      </p>
    </div>
  );
}

// ---------- Help shape this ----------

export function ResearchSignup({ id }: { id: string }) {
  const r = getCopy().research_consent;
  const headingId = useId();
  const emailId = useId();
  const consentId = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent || !email.trim()) return;
    setState("busy");
    const ok = await send(
      "/api/research-contact",
      "POST",
      { email, response_id: id, consent_version: r.consent_version, consent: true },
      id,
    );
    if (ok) track("research_email_left");
    setState(ok ? "done" : "error");
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-md border-2 border-accent bg-surface-raised px-4 py-5">
      <div className="flex flex-col gap-2">
        <h2 id={headingId} className={`${size.heading} font-bold`}>
          {r.heading}
        </h2>
        <p className={size.card}>{r.body}</p>
      </div>
      {state === "done" ? (
        <p role="status" className="rounded-md bg-accent-soft p-4">
          {fill(r.thanks)}
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <label htmlFor={emailId} className="font-semibold">
            {r.email_label}
          </label>
          <input
            id={emailId}
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex items-start gap-3">
            <input
              id={consentId}
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 size-6 flex-none accent-accent"
            />
            <label htmlFor={consentId}>{r.checkbox}</label>
          </div>
          <Button type="submit" variant="secondary" disabled={!consent || !email.trim() || state === "busy"}>
            {r.button}
          </Button>
          {state === "error" && (
            <p role="alert" className="type-small">
              {r.error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

// ---------- For visitors ----------

/** Start a fresh quiz that is compared with response `id` when it is saved, as a compare link (/c/{id}) does. */
function useStartCompare(id: string): () => void {
  const router = useRouter();
  return () => {
    clearQuiz();
    saveCompareWith(id);
    track("compare_started");
    router.push("/start");
  };
}

/** The element IDs of the visitor's two compare boxes, which the sticky bar watches. */
const COMPARE_BOX = { top: "take-quiz-top", end: "take-quiz-end" } as const;

/**
 * "Where would you land?" on a shared result (issue #37): at the top, under the
 * banner, and again at the end. The button starts the quiz linked to this
 * result, so the friend sees the comparison when they finish.
 */
export function VisitorCompare({ id, place }: { id: string; place: keyof typeof COMPARE_BOX }) {
  const p = getCopy().result_page;
  const headingId = useId();
  const start = useStartCompare(id);
  return (
    <section
      id={COMPARE_BOX[place]}
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-md border-2 border-accent bg-surface-raised px-4 py-5"
    >
      <h2 id={headingId} className={`${size.heading} font-bold`}>
        {p.take_it_heading}
      </h2>
      <p className={size.card}>{fill(p.compare_body, { n: screenCount(getContent()) })}</p>
      <Button onClick={start}>{p.compare_button}</Button>
    </section>
  );
}

/**
 * On phones, a slim bar fixed to the bottom of the screen with the same
 * button, shown only while neither compare box is on screen. The page gets
 * bottom padding of the bar's height, so the bar never covers anything.
 */
export function CompareBar({ id }: { id: string }) {
  const p = getCopy().result_page;
  const start = useStartCompare(id);
  const bar = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState<Record<string, boolean>>({ [COMPARE_BOX.top]: true });

  useEffect(() => {
    const boxes = Object.values(COMPARE_BOX)
      .map((x) => document.getElementById(x))
      .filter((x): x is HTMLElement => x !== null);
    if (boxes.length === 0 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) =>
      setOnScreen((now) => ({ ...now, ...Object.fromEntries(entries.map((e) => [e.target.id, e.isIntersecting])) })),
    );
    boxes.forEach((b) => observer.observe(b));
    return () => observer.disconnect();
  }, []);

  // The bar is display: none from the sm breakpoint up, so its height is 0 there.
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      document.body.style.paddingBottom = el.offsetHeight ? `${el.offsetHeight}px` : "";
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.body.style.paddingBottom = "";
    };
  }, []);

  const shown = !Object.values(onScreen).some(Boolean);
  return (
    <div
      ref={bar}
      data-testid="compare-bar"
      aria-hidden={!shown}
      className={`fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] motion-safe:transition-transform sm:hidden ${
        shown ? "" : "invisible translate-y-full"
      }`}
    >
      <Button onClick={start} tabIndex={shown ? 0 : -1}>
        {p.compare_button}
      </Button>
    </div>
  );
}

/** For a result that can't be shown in full: an invitation to take the quiz, without a comparison. */
export function TakeIt() {
  const p = getCopy().result_page;
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-md border-2 border-accent bg-surface-raised px-4 py-5">
      <h2 id={headingId} className={`${size.heading} font-bold`}>
        {p.take_it_heading}
      </h2>
      <p className={size.card}>{fill(p.take_it_body, { n: screenCount(getContent()) })}</p>
      <LinkButton href="/">{p.take_it_button}</LinkButton>
    </section>
  );
}

// ---------- Take the quiz again ----------

/**
 * At the end of your own result (issue #37). A saved result stays at its link,
 * so this just clears any progress and goes to /start. An unsaved one would be
 * lost, so it asks first, on the page, never in a browser dialog.
 */
export function TakeAgain({ saved }: { saved: boolean }) {
  const p = getCopy().result_page;
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const question = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (asking) question.current?.focus();
  }, [asking]);

  function again() {
    clearQuiz();
    saveCompareWith(null);
    router.push("/start");
  }

  if (asking) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-raised p-4">
        <p ref={question} tabIndex={-1} className="font-semibold outline-none">
          {p.again_unsaved}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={again}>{p.again_confirm}</Button>
          <Button variant="secondary" onClick={() => setAsking(false)}>
            {p.again_keep}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <p>
      <a
        href="/start"
        onClick={(e) => {
          e.preventDefault();
          if (saved) again();
          else setAsking(true);
        }}
        className="flex min-h-tap-min items-center"
      >
        {p.again_link}
      </a>
    </p>
  );
}

// ---------- Go deeper ----------

export type DeeperSection = "stands_out" | "talk" | "elsewhere" | "about_p1" | "about_p2" | "common_ground" | "others" | "help" | "why";

/**
 * One folded row under "Go deeper" (issue #28): a native details element,
 * closed on load. The first time it is opened in a page view it is counted,
 * to show which folds people read.
 */
export function DeeperRow({ section, title, children }: { section: DeeperSection; title: React.ReactNode; children: React.ReactNode }) {
  const counted = useRef(false);
  return (
    <details
      className="group border-b border-line"
      onToggle={(e) => {
        if (!e.currentTarget.open || counted.current) return;
        counted.current = true;
        track("result_section_opened", { section });
      }}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-2 font-bold [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronIcon className="flex-none transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className={`flex flex-col gap-3 pb-4 ${size.card}`}>{children}</div>
    </details>
  );
}
