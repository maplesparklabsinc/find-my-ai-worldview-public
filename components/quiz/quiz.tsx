"use client";

// The quiz: one question per screen in the person's seeded order and answer
// direction (docs/01-product-spec.md 5.3, design/screens/Question and Tradeoff).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackIcon, CheckIcon } from "@/components/icons";
import { Button, OptionButton } from "@/components/ui";
import { track } from "@/lib/analytics";
import { getContent, type Item } from "@/lib/content";
import { fill, getCopy } from "@/lib/content/copy";
import { newSeed, shownOptions, standardSequence, stepItem, type AnswerDirection, type Step } from "@/lib/form";
import {
  addTime,
  goTo,
  loadLargerText,
  loadQuiz,
  newQuiz,
  saveLargerText,
  saveQuiz,
  setAnswer,
  type QuizState,
} from "@/lib/quiz";
import type { AnswerValue, TradeoffAnswer } from "@/lib/scoring";

/** Pause after a tap so the selected state shows before moving on (design/README.md "Motion"). */
const ADVANCE_MS = 400;
const STRENGTHS: TradeoffAnswer["strength"][] = ["slightly", "strongly"];

export default function Quiz() {
  const content = useMemo(() => getContent(), []);
  const copy = useMemo(() => getCopy(), []);
  const router = useRouter();
  const [state, setState] = useState<QuizState>(() => loadQuiz() ?? newQuiz(newSeed()));
  const [larger, setLarger] = useState(loadLargerText);
  const seq = useMemo(() => standardSequence(content, state.seed), [content, state.seed]);
  const total = seq.steps.length;
  const done = state.index >= total;
  const step = done ? null : seq.steps[state.index];

  const enteredAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => saveQuiz(state), [state]);
  useEffect(() => {
    // A fresh quiz, not a refresh part-way through.
    if (state.index === 0 && Object.keys(state.answers).length === 0) track("quiz_started");
    // Once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (done) router.replace("/result");
  }, [done, router]);
  useEffect(() => {
    enteredAt.current = performance.now();
    if (state.index > 0) heading.current?.focus();
  }, [state.index]);
  useEffect(() => () => clearTimer(), []);

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  /** Leave the current step for another one, adding the time spent on it. */
  function move(to: number) {
    clearTimer();
    const from = seq.steps[state.index];
    if (to > state.index && from?.section && seq.steps[to]?.section !== from.section) {
      track("section_completed", { section: from.section });
    }
    const now = performance.now();
    const spent = now - enteredAt.current;
    enteredAt.current = now;
    setState((s) => {
      const key = seq.steps[s.index]?.key;
      return goTo(key ? addTime(s, key, spent) : s, to, total);
    });
  }

  function answer(value: AnswerValue | undefined, advance: "now" | "after_pause" | "stay") {
    if (!step) return;
    clearTimer();
    setState((s) => setAnswer(s, step.key, value));
    if (advance === "now") move(state.index + 1);
    if (advance === "after_pause") timer.current = setTimeout(() => move(state.index + 1), ADVANCE_MS);
  }

  if (!step) return null;
  const item = stepItem(content, step);
  const value = state.answers[step.key];
  const isFirstOutro = step.part === "outro" && seq.steps[state.index - 1]?.part !== "outro";
  const isLast = state.index === total - 1;
  const stemId = `stem-${step.key}`;

  // Skip leaves the question unanswered. On the trust grid it keeps any rows
  // already answered: those are real answers, not a partial skip.
  const skip = () => (item.format === "GRID" ? move(state.index + 1) : answer(undefined, "now"));

  return (
    <div className={`flex min-h-dvh flex-col px-4 pt-1 pb-4 sm:px-6 ${larger ? "larger-text" : ""}`}>
      <div className="mx-auto flex w-full max-w-measure-body flex-1 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <header className="flex min-h-tap-min flex-wrap items-center gap-1">
            {state.index > 0 ? (
              <button
                type="button"
                aria-label="Back"
                onClick={() => move(state.index - 1)}
                className="-ml-3.5 flex size-12 items-center justify-center rounded-md text-ink"
              >
                <BackIcon />
              </button>
            ) : (
              <Link href="/start" aria-label="Back" className="-ml-3.5 flex size-12 items-center justify-center text-ink">
                <BackIcon />
              </Link>
            )}
            <span className="flex-1 type-small text-ink-muted">
              {fill(copy.quiz.progress, { n: state.index + 1, total })}
            </span>
            <button
              type="button"
              aria-label="Larger text"
              aria-pressed={larger}
              onClick={() => {
                setLarger(!larger);
                saveLargerText(!larger);
              }}
              className={`flex size-12 flex-none items-center justify-center rounded-md text-[1.1875rem] font-bold text-ink ${
                larger ? "border-2 border-accent bg-accent-soft" : "border border-transparent"
              }`}
            >
              Aa
            </button>
            {/* Top right on every question, trade-offs included (issue #37). */}
            <button type="button" onClick={skip} className="flex min-h-tap-min items-center pl-3 type-small text-ink-muted">
              Skip
            </button>
          </header>
          <div
            role="progressbar"
            aria-label="Progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={state.index + 1}
            className="h-1.5 overflow-hidden rounded-pill bg-line"
          >
            <div className="h-1.5 rounded-pill bg-accent" style={{ width: `${((state.index + 1) / total) * 100}%` }} />
          </div>
        </div>

        <div key={step.key} className="flex flex-1 flex-col gap-4 motion-safe:animate-[fade-in_200ms_ease-out]">
          {isFirstOutro && (
            <div className="flex flex-col gap-1 rounded-md bg-accent-soft px-4 py-3">
              <span className="font-bold">{copy.quiz.about_you_heading}</span>
              <p>{copy.quiz.about_you_intro}</p>
            </div>
          )}
          {step.kind === "confidence_probe" && (
            <div className="flex items-start gap-3 rounded-md bg-accent-soft px-4 py-3">
              <CheckIcon className="mt-1 flex-none text-accent" />
              <p>{copy.quiz.section_end}</p>
            </div>
          )}
          {item.format === "SC" && <p className="-mb-2 type-small text-ink-muted">{copy.quiz.scenario_label}</p>}
          {/* On the trust grid the row name is the question; the shared stem sits above it, smaller (issue #37). */}
          <h1
            id={stemId}
            ref={heading}
            tabIndex={-1}
            className={`wrap-break-word outline-none ${item.format === "GRID" ? "-mb-2 type-small text-ink-muted" : "type-statement"}`}
          >
            {item.stem}
          </h1>
          <StepBody
            step={step}
            item={item}
            value={value}
            direction={seq.direction}
            likertLabels={content.items.likert_labels}
            strengthLabels={content.items.tradeoff_strength_labels}
            stemId={stemId}
            isLast={isLast}
            onPick={(v) => answer(v, "after_pause")}
            onRecord={(v) => answer(v, "stay")}
            onSave={(v) => answer(v, "now")}
          />
        </div>
      </div>
    </div>
  );
}

interface BodyProps {
  step: Step;
  item: Item;
  value: AnswerValue | undefined;
  direction: AnswerDirection;
  likertLabels: string[];
  strengthLabels: string[];
  stemId: string;
  isLast: boolean;
  /** Record without moving on (a trust-grid row). */
  onRecord: (v: AnswerValue) => void;
  /** Single-tap answers: record and move on after a short pause. */
  onPick: (v: AnswerValue) => void;
  /** Multi-part answers: record (or clear) and move on now. */
  onSave: (v: AnswerValue | undefined) => void;
}

function StepBody(props: BodyProps) {
  const { item, value, direction, likertLabels, stemId, onPick } = props;
  switch (item.format) {
    case "L7":
    case "SC":
    case "CAT":
      return (
        <div role="group" aria-labelledby={stemId} className="flex flex-col gap-1.5">
          {shownOptions(item, direction, likertLabels).map((o) => (
            <OptionButton key={o.label} selected={value === o.value} onClick={() => onPick(o.value)}>
              {o.label}
            </OptionButton>
          ))}
        </div>
      );
    case "TO":
      return <Tradeoff {...props} />;
    case "GRID":
      return <Grid {...props} />;
    case "TXT":
      return <FreeText {...props} />;
  }
}

function Footer({ ready, onNext }: { ready: boolean; onNext: () => void }) {
  return (
    <div className="mt-auto flex flex-col items-center gap-2 pt-4">
      <Button disabled={!ready} aria-disabled={!ready} onClick={onNext}>
        Next
      </Button>
    </div>
  );
}

function Tradeoff({ item, value, direction, likertLabels, strengthLabels, stemId, onSave }: BodyProps) {
  const saved = value as TradeoffAnswer | undefined;
  const [choice, setChoice] = useState<0 | 1 | null>(saved?.choice ?? null);
  const [strength, setStrength] = useState<TradeoffAnswer["strength"] | null>(saved?.strength ?? null);
  const ready = choice !== null && strength !== null;
  return (
    <>
      <div role="group" aria-labelledby={stemId} className="flex flex-col gap-2">
        {shownOptions(item, direction, likertLabels).map((o) => (
          <OptionButton key={o.value} tall selected={choice === o.value} onClick={() => setChoice(o.value as 0 | 1)}>
            {o.label}
          </OptionButton>
        ))}
      </div>
      {choice !== null && (
        <div className="flex flex-col gap-2">
          <span id="how-strongly" className="font-semibold">
            How strongly?
          </span>
          <div role="group" aria-labelledby="how-strongly" className="grid grid-cols-2 gap-2">
            {strengthLabels.map((label, i) => (
              <OptionButton key={label} centred selected={strength === STRENGTHS[i]} onClick={() => setStrength(STRENGTHS[i])}>
                {label}
              </OptionButton>
            ))}
          </div>
        </div>
      )}
      <Footer ready={ready} onNext={() => ready && onSave({ choice, strength })}  />
    </>
  );
}

/**
 * The trust grid, one row at a time (docs/01-product-spec.md 5.4): the row name
 * as the heading, styled like a question, with "n of 4", its options, then on
 * to the next unanswered row after a short pause. Answered rows are listed underneath with "Change". The whole grid is
 * one question; it moves on once every row has an answer.
 */
function Grid({ item, value, onRecord, onPick }: BodyProps) {
  const copy = getCopy();
  const [grid, setGrid] = useState<Record<string, number>>((value as Record<string, number> | undefined) ?? {});
  const firstOpen = item.rows.findIndex((r) => grid[r] === undefined);
  const [current, setCurrent] = useState(firstOpen === -1 ? 0 : firstOpen);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const row = item.rows[current];
  const rowId = `grid-row-${current}`;
  function pick(i: number) {
    const next = { ...grid, [row]: i };
    setGrid(next);
    if (timer.current) clearTimeout(timer.current);
    const open = item.rows.findIndex((r) => next[r] === undefined);
    if (open === -1) {
      onPick(next);
    } else {
      onRecord(next);
      timer.current = setTimeout(() => setCurrent(open), ADVANCE_MS);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id={rowId} className="min-w-0 type-statement wrap-break-word">
            {row}
          </h2>
          <span className="flex-none type-small text-ink-muted">
            {fill(copy.quiz.grid_count, { n: current + 1, total: item.rows.length })}
          </span>
        </div>
        <div role="group" aria-labelledby={rowId} className="flex flex-col gap-1.5">
          {item.options.map((label, i) => (
            <OptionButton key={label} selected={grid[row] === i} onClick={() => pick(i)}>
              {label}
            </OptionButton>
          ))}
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {item.rows.map((r, k) =>
          k === current || grid[r] === undefined ? null : (
            <li key={r}>
              <button
                type="button"
                onClick={() => setCurrent(k)}
                className="flex min-h-tap-min w-full items-center justify-between gap-3 border-b border-line px-1 text-left type-small text-ink"
              >
                <span>{r}</span>
                <span className="text-ink-muted">
                  {item.options[grid[r]]} · {copy.quiz.grid_change}
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
    </>
  );
}

function FreeText({ value, isLast, stemId, onSave }: BodyProps) {
  const copy = getCopy();
  const [text, setText] = useState(typeof value === "string" ? value : "");
  return (
    <>
      <div className="flex flex-col gap-2">
        <p id="free-text-hint" className="type-small text-ink-muted">
          {copy.quiz.free_text_hint}
        </p>
        <textarea
          aria-labelledby={stemId}
          aria-describedby="free-text-hint"
          rows={4}
          maxLength={copy.quiz.free_text_max}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-32 w-full resize-y rounded-sm border border-line-strong bg-surface-raised px-4 py-3 type-body text-ink"
        />
        <span className="self-end type-small text-ink-muted">{fill(copy.quiz.free_text_limit, { n: copy.quiz.free_text_max })}</span>
      </div>
      <Button onClick={() => onSave(text.trim() || undefined)}>{isLast ? copy.quiz.finish_button : "Next"}</Button>
    </>
  );
}
