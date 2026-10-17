"use client";

// After the last question (docs/01-product-spec.md 4 and 5.5): the quick check
// for 1 in 4 people, or for everyone else an optional guess at where the
// answers landed (issue #24); never both (issue #37). Then the answers are
// saved and the person moves to their own result page, /r/{id}. If saving
// fails, they can try again or see the result worked out here in the browser,
// unsaved.
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { Button, LinkButton, OptionButton } from "@/components/ui";
import { track } from "@/lib/analytics";
import { getContent, type Content } from "@/lib/content";
import { fill, getCopy } from "@/lib/content/copy";
import { SEQUENCE_VERSION } from "@/lib/form";
import { BROAD_KINDS, type Prediction } from "@/lib/prediction";
import { quickCheckPlan } from "@/lib/quickcheck";
import {
  addMine,
  clearQuiz,
  loadCompareWith,
  loadQuiz,
  newSubmissionKey,
  saveCompareWith,
  savePredictionNote,
  saveQuickCheckNote,
  saveQuiz,
  type QuizState,
} from "@/lib/quiz";
import { resultView } from "@/lib/results";
import { saveWithRetry } from "@/lib/save";
import { score } from "@/lib/scoring";
import type { SaveRefusal } from "@/lib/submit";
import { Reflection, TakeAgain } from "./actions";
import { ResultBody } from "./result-view";

type Phase = "predict" | "check" | "saving" | "failed" | "unsaved";
/** Why the last save failed: a reason from the server, or "failed" for anything else (network, 500). */
type Failure = SaveRefusal | "failed";

const REFUSALS: readonly string[] = ["too_quick", "outdated", "rate_limited"] satisfies SaveRefusal[];
const RESPONSE_ID = /^[A-Za-z0-9]{12,32}$/;

export default function Finish() {
  const content = useMemo(() => getContent(), []);
  const copy = useMemo(() => getCopy(), []);
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizState | null>(() => loadQuiz());
  const compareWith = useMemo(() => loadCompareWith(), []);
  const result = useMemo(() => (quiz?.finished ? score(content, quiz.answers) : null), [content, quiz]);
  const plan = useMemo(() => {
    if (!quiz || !result || compareWith) return null; // never on compare results (docs/04 section 6)
    return quickCheckPlan(content, quiz.seed, result, { show: copy.quick_check.show_share, own: copy.quick_check.own_share });
  }, [content, copy, quiz, result, compareWith]);
  // People in the quick check skip the guess, so nobody sees both screens
  // (issue #37). Their prediction is never set, and is stored as not shown.
  const [phase, setPhase] = useState<Phase>(() => (plan ? (quiz?.quickCheck ? "saving" : "check") : quiz?.prediction ? "saving" : "predict"));
  const [failure, setFailure] = useState<Failure>("failed");
  // True while a save is in flight. Set inside save() itself, so "Try again"
  // and the effect below can never both send the quiz (issue #18).
  const started = useRef(false);

  useEffect(() => {
    if (phase !== "saving" || !quiz?.finished) return;
    void save(quiz);
  });

  async function save(quiz0: QuizState) {
    if (started.current) return;
    started.current = true;
    // One key per completed quiz, kept with it, so the server stores it once
    // even if a reply is lost and the quiz is sent again.
    const q = quiz0.submissionKey ? quiz0 : { ...quiz0, submissionKey: newSubmissionKey() };
    if (q !== quiz0) {
      saveQuiz(q);
      setQuiz(q);
    }
    setPhase("saving");
    try {
      // Retried on network errors and 5xx (lib/save), with the same submission key each time.
      const { res } = await saveWithRetry(() => fetch("/api/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          form: content.config.form,
          seed: q.seed,
          sequence_version: SEQUENCE_VERSION,
          answers: q.answers,
          timings_ms: q.timings,
          answer_changes: q.changes ?? {},
          quick_check: q.quickCheck ?? null,
          prediction: q.prediction ?? null,
          compared_with: compareWith,
          submission_key: q.submissionKey,
        }),
      }), "response");
      if (!res) throw new Refused("failed");
      const body = (await res.json().catch(() => null)) as { id?: unknown; token?: unknown; reason?: unknown } | null;
      if (!res.ok) {
        const reason = typeof body?.reason === "string" && REFUSALS.includes(body.reason) ? (body.reason as SaveRefusal) : "failed";
        throw new Refused(reason);
      }
      const { id, token } = body ?? {};
      if (typeof id !== "string" || !RESPONSE_ID.test(id) || typeof token !== "string") throw new Refused("failed");
      addMine(id, token);
      if (q.quickCheck) saveQuickCheckNote(id, q.quickCheck.shown);
      if (q.prediction && q.prediction.kind !== "skipped") savePredictionNote(id, q.prediction);
      track("quiz_completed");
      track("result_revealed");
      if (compareWith) track("compare_completed");
      saveCompareWith(null);
      clearQuiz();
      router.replace(`/r/${id}`);
    } catch (e) {
      started.current = false;
      setFailure(e instanceof Refused ? e.reason : "failed");
      setPhase("failed");
    }
  }

  function predict(prediction: Prediction) {
    if (!quiz) return;
    if (prediction.kind === "skipped") track("prediction_skipped");
    else track("prediction_submitted", { kind: prediction.kind });
    const next = { ...quiz, prediction };
    saveQuiz(next);
    setQuiz(next);
    setPhase("saving");
  }

  function rate(rating: number) {
    if (!quiz || !plan) return;
    const next = { ...quiz, quickCheck: { shown: plan.shown, perspective: plan.perspective, rating } };
    saveQuiz(next);
    setQuiz(next);
    setPhase("saving");
  }

  if (!quiz?.finished || !result) return <Shell><Missing /></Shell>;

  if (phase === "predict") {
    return (
      <Shell compact>
        <Predict content={content} onDone={predict} />
      </Shell>
    );
  }

  if (phase === "check" && plan) {
    const p = content.perspectives.perspectives.find((x) => x.id === plan.perspective)!;
    const qc = copy.quick_check;
    return (
      // Fits a 390×660 screen without scrolling (issue #37).
      <Shell compact>
        <main className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="type-title">{qc.heading}</h1>
            <p className="type-small">{qc.intro}</p>
          </div>
          {/* The short summary, not the full description, for both groups (docs/04 section 6). */}
          <blockquote className="border-l-4 border-line-strong pl-4">
            <p>{p.card_summary}</p>
          </blockquote>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 font-semibold">{qc.question}</legend>
            {qc.options.map((label, i) => (
              <OptionButton key={label} selected={false} onClick={() => rate(i + 1)}>
                {label}
              </OptionButton>
            ))}
          </fieldset>
        </main>
      </Shell>
    );
  }

  if (phase === "unsaved") {
    return (
      <Shell>
        <p className="rounded-md border border-line bg-surface-raised p-4 type-small text-ink-muted">{copy.saving.unsaved_note}</p>
        <ResultBody
          view={resultView(content, copy, result, quiz.answers)}
          afterTop={quiz.prediction && <Reflection prediction={quiz.prediction} outcome={result.outcome} />}
          end={<TakeAgain saved={false} />}
        />
      </Shell>
    );
  }

  if (phase === "failed") {
    // Retrying can't help a quiz that was too quick or is from an older
    // version, so those get a different way forward instead.
    const message = {
      failed: copy.saving.failed,
      too_quick: copy.saving.too_quick,
      outdated: copy.saving.outdated,
      rate_limited: copy.saving.rate_limited,
    }[failure];
    const compareSkipped = failure === "too_quick" && compareWith !== null;
    return (
      <Shell>
        <main className="flex flex-col gap-6" role="alert">
          <h1 className="type-title">{copy.saving.heading}</h1>
          <p>{message}</p>
          {/* A comparison needs a saved result, so a quick finish from a shared link would lose it without a word (issue #37). */}
          {compareSkipped && <p>{copy.saving.too_quick_compare}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            {(failure === "failed" || failure === "rate_limited") && (
              <Button onClick={() => void save(quiz)}>{copy.saving.retry}</Button>
            )}
            {(failure === "outdated" || compareSkipped) && (
              <Button
                onClick={() => {
                  // The link to the shared result is kept, so the new quiz is still compared with it.
                  clearQuiz();
                  router.push("/start");
                }}
              >
                {copy.saving.start_again}
              </Button>
            )}
            {failure !== "outdated" && (
              <Button
                variant={failure === "too_quick" && !compareSkipped ? "primary" : "secondary"}
                onClick={() => {
                  track("result_revealed");
                  setPhase("unsaved");
                }}
              >
                {copy.saving.view_unsaved}
              </Button>
            )}
          </div>
        </main>
      </Shell>
    );
  }

  return (
    <Shell>
      <main className="flex flex-col gap-4" aria-busy="true">
        <h1 className="type-title">{copy.saving.heading}</h1>
        <div className="h-1.5 overflow-hidden rounded-pill bg-line">
          <div className="h-full w-1/3 animate-pulse rounded-pill bg-accent motion-reduce:animate-none" />
        </div>
      </main>
    </Shell>
  );
}

class Refused extends Error {
  constructor(readonly reason: Failure) {
    super(`save refused: ${reason}`);
  }
}

/** `compact`: less space under the site name, for the screens before the result, which should fit a phone screen. */
function Shell({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  const copy = getCopy();
  return (
    <div className="px-4 pt-2 pb-6 sm:px-6">
      <div className={`mx-auto flex w-full max-w-measure-body flex-col ${compact ? "gap-4" : "gap-10"}`}>
        <header className={`flex items-center ${compact ? "min-h-12" : "min-h-14"}`}>
          <span className="type-small font-bold">{copy.site.name}</span>
        </header>
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}

function Missing() {
  const copy = getCopy();
  return (
    <main className="flex flex-col gap-6">
      <p>{copy.results.missing}</p>
      <LinkButton href="/start">{copy.landing.start_button}</LinkButton>
    </main>
  );
}

type Broad = (typeof BROAD_KINDS)[number];

/**
 * Before the result: where does the person think their answers landed?
 * Optional, and it never changes the result (issue #24). Tap one perspective,
 * or two for "between them" (a third tap replaces the older of the two), or
 * one of the other outcomes, which clears the perspectives (issue #37).
 */
function Predict({ content, onDone }: { content: Content; onDone: (p: Prediction) => void }) {
  const copy = getCopy().prediction;
  const perspectives = content.perspectives.perspectives;
  const heading = useRef<HTMLHeadingElement>(null);
  const ids = { hint: useId() };
  // In the order they were tapped, oldest first.
  const [picked, setPicked] = useState<string[]>([]);
  const [broad, setBroad] = useState<Broad | null>(null);

  useEffect(() => {
    heading.current?.focus();
    track("prediction_shown");
  }, []);

  function toggle(id: string) {
    setBroad(null);
    setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id].slice(-2)));
  }

  function submit() {
    if (picked.length === 1) return onDone({ kind: "perspective", perspectives: [picked[0]] });
    if (picked.length === 2) return onDone({ kind: "between", perspectives: [picked[0], picked[1]] });
    if (broad) onDone({ kind: broad });
  }

  const labels: Record<Broad, string> = copy.options;
  return (
    // At 320px with 200% text a long name ("Precautionists") can be wider than the screen; let it break.
    <main className="flex flex-col gap-6 [overflow-wrap:anywhere]">
      <div className="flex flex-col gap-4">
        <h1 ref={heading} tabIndex={-1} className="type-title outline-none">
          {copy.heading}
        </h1>
        <p>{copy.body}</p>
      </div>
      <fieldset aria-describedby={ids.hint} className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 font-semibold">{copy.group_label}</legend>
        <div className="flex flex-col gap-2">
          {perspectives.map((p) => (
            <OptionButton key={p.id} tall selected={picked.includes(p.id)} onClick={() => toggle(p.id)}>
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{p.name}</span>
                <span className="type-small font-normal text-ink-muted">{p.tagline}</span>
              </span>
            </OptionButton>
          ))}
        </div>
        <p id={ids.hint} aria-live="polite" className="type-small text-ink-muted">
          {picked.length > 0 ? fill(copy.picked, { n: picked.length }) : ""}
        </p>
        {BROAD_KINDS.map((kind) => (
          <OptionButton
            key={kind}
            selected={broad === kind}
            onClick={() => {
              setPicked([]);
              setBroad(kind);
            }}
          >
            {labels[kind]}
          </OptionButton>
        ))}
      </fieldset>
      {/* Kept on screen while the cards scroll, so the buttons are never out of reach on a phone. */}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:flex-row sm:border-0 sm:p-0">
        <Button onClick={submit} disabled={picked.length === 0 && !broad}>
          {copy.submit}
        </Button>
        <Button variant="secondary" onClick={() => onDone({ kind: "skipped" })}>
          {copy.skip}
        </Button>
      </div>
    </main>
  );
}
