"use client";

import { useMemo, useState } from "react";
import { getContent, type Item } from "@/lib/content";
import { newSeed, shownOptions, standardSequence, stepItem, type AnswerDirection, type Step } from "@/lib/form";
import { getCopy } from "@/lib/content/copy";
import { compareView, resultView } from "@/lib/results";
import { compare, score, type Answers, type AnswerValue, type TradeoffAnswer } from "@/lib/scoring";

const STORAGE_KEY = "dev-quiz-v1";

interface Saved {
  seed: number;
  answers: Answers;
  index: number;
}

function load(): Saved {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    // Fall through to a fresh start.
  }
  return { seed: newSeed(), answers: {}, index: 0 };
}

function save(s: Saved) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage can be unavailable (private mode); progress just won't survive a refresh.
  }
}

/** A random answer for any step, for quick testing. */
function randomAnswer(item: Item): AnswerValue | undefined {
  const pick = (n: number) => Math.floor(Math.random() * n);
  switch (item.format) {
    case "L7":
      return 1 + pick(7);
    case "TO":
      return { choice: pick(2) as 0 | 1, strength: pick(2) ? "strongly" : "slightly" };
    case "SC":
    case "CAT":
      return pick(item.options.length);
    case "GRID":
      return Object.fromEntries(item.rows.map((r) => [r, pick(item.options.length)]));
    case "TXT":
      return undefined;
  }
}

export default function DevQuiz() {
  const content = useMemo(() => getContent(), []);
  const [state, setState] = useState<Saved>(load);
  const { seed, answers, index } = state;
  const seq = useMemo(() => standardSequence(content, seed), [content, seed]);
  const done = index >= seq.steps.length;

  const update = (next: Partial<Saved>) => {
    const s = { ...state, ...next };
    setState(s);
    save(s);
  };
  const answer = (key: string, value: AnswerValue | undefined, advance = true) => {
    const a = { ...answers };
    if (value === undefined) delete a[key];
    else a[key] = value;
    update({ answers: a, index: advance ? index + 1 : index });
  };
  const restart = (newSeedValue: number) => update({ seed: newSeedValue, answers: {}, index: 0 });
  const fillRest = () => {
    const a = { ...answers };
    for (const step of seq.steps.slice(index)) {
      const v = randomAnswer(stepItem(content, step));
      if (v !== undefined) a[step.key] = v;
    }
    update({ answers: a, index: seq.steps.length });
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 font-mono text-sm">
      <h1 className="text-lg font-bold">Dev: quiz walkthrough</h1>
      <p>Testing only. Unstyled. Answers stay in this tab (sessionStorage).</p>

      <section className="flex flex-wrap items-end gap-2 border p-2">
        <label>
          Seed{" "}
          <input
            className="w-36 border px-1"
            type="number"
            min={0}
            max={4294967295}
            value={seed}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 0 && n <= 0xffffffff) restart(n);
            }}
          />
        </label>
        <button className="border px-2" onClick={() => restart(newSeed())}>
          New seed
        </button>
        <button className="border px-2" onClick={() => restart(seed)}>
          Restart
        </button>
        <button className="border px-2" onClick={fillRest} disabled={done}>
          Fill the rest randomly
        </button>
        <span>
          Question {Math.min(index + 1, seq.steps.length)} of {seq.steps.length} · {Object.keys(answers).length} answered · {seq.direction}
        </span>
      </section>

      {done ? (
        <Result answers={answers} seed={seed} onBack={() => update({ index: seq.steps.length - 1 })} />
      ) : (
        <StepView
          key={seq.steps[index].key}
          step={seq.steps[index]}
          item={stepItem(content, seq.steps[index])}
          direction={seq.direction}
          value={answers[seq.steps[index].key]}
          likertLabels={content.items.likert_labels}
          strengthLabels={content.items.tradeoff_strength_labels}
          onAnswer={(v, advance) => answer(seq.steps[index].key, v, advance)}
          onBack={index > 0 ? () => update({ index: index - 1 }) : undefined}
          onSkip={() => answer(seq.steps[index].key, undefined)}
          onNext={() => update({ index: index + 1 })}
        />
      )}

      <details>
        <summary>Question order for this seed</summary>
        <ol className="list-decimal pl-8">
          {seq.steps.map((s, i) => (
            <li key={s.key} className={i === index ? "font-bold" : undefined}>
              <button onClick={() => update({ index: i })}>
                {s.key} · {s.part}
                {s.section ? ` ${s.section}` : ""} {s.key in answers ? "✓" : ""}
              </button>
            </li>
          ))}
        </ol>
      </details>
    </main>
  );
}

interface StepViewProps {
  step: Step;
  item: Item;
  direction: AnswerDirection;
  value: AnswerValue | undefined;
  likertLabels: string[];
  strengthLabels: string[];
  onAnswer: (v: AnswerValue, advance: boolean) => void;
  onBack?: () => void;
  onSkip: () => void;
  onNext: () => void;
}

function StepView({ step, item, direction, value, likertLabels, strengthLabels, onAnswer, onBack, onSkip, onNext }: StepViewProps) {
  const where = step.section ? `section ${step.section}` : step.part;
  return (
    <section className="space-y-3 border p-3" aria-labelledby="stem">
      <p>
        {where} · {step.key} · {item.format}
        {step.kind !== "item" ? ` · ${step.kind}` : ""}
      </p>
      <h2 id="stem" className="text-base">
        {item.stem}
      </h2>
      <Answer
        item={item}
        direction={direction}
        value={value}
        likertLabels={likertLabels}
        strengthLabels={strengthLabels}
        onAnswer={onAnswer}
        onNext={onNext}
      />
      <div className="flex gap-2">
        <button className="border px-2" onClick={onBack} disabled={!onBack}>
          Back
        </button>
        <button className="border px-2" onClick={onSkip}>
          Skip
        </button>
        {value !== undefined && (
          <button className="border px-2" onClick={onNext}>
            Keep answer and continue
          </button>
        )}
      </div>
    </section>
  );
}

function Choice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <li>
      <button className={`w-full border px-2 py-1 text-left ${selected ? "font-bold" : ""}`} aria-pressed={selected} onClick={onClick}>
        {selected ? "● " : "○ "}
        {label}
      </button>
    </li>
  );
}

function Answer({
  item,
  direction,
  value,
  likertLabels,
  strengthLabels,
  onAnswer,
  onNext,
}: Pick<StepViewProps, "item" | "direction" | "value" | "likertLabels" | "strengthLabels" | "onAnswer" | "onNext">) {
  const shown = shownOptions(item, direction, likertLabels);
  const [draft, setDraft] = useState<AnswerValue | undefined>(value);

  switch (item.format) {
    case "L7":
      return (
        <ul className="space-y-1">
          {shown.map((o) => (
            <Choice key={o.label} label={o.label} selected={value === o.value} onClick={() => onAnswer(o.value, true)} />
          ))}
        </ul>
      );
    case "SC":
    case "CAT":
      return (
        <ul className="space-y-1">
          {shown.map((o) => (
            <Choice key={o.label} label={o.label} selected={value === o.value} onClick={() => onAnswer(o.value, true)} />
          ))}
        </ul>
      );
    case "TO": {
      const to = draft as TradeoffAnswer | undefined;
      return (
        <div className="space-y-2">
          <ul className="space-y-1">
            {shown.map((o) => (
              <Choice
                key={o.label}
                label={o.label}
                selected={to?.choice === o.value}
                onClick={() => setDraft({ choice: o.value as 0 | 1, strength: to?.strength ?? "slightly" })}
              />
            ))}
          </ul>
          {to && (
            <fieldset>
              <legend>How strongly?</legend>
              <ul className="flex gap-2">
                {strengthLabels.map((label) => {
                  const strength = label.toLowerCase() as TradeoffAnswer["strength"];
                  return (
                    <Choice
                      key={label}
                      label={label}
                      selected={value !== undefined && to.strength === strength}
                      onClick={() => onAnswer({ choice: to.choice, strength }, true)}
                    />
                  );
                })}
              </ul>
            </fieldset>
          )}
        </div>
      );
    }
    case "GRID": {
      const grid = (draft as Record<string, number> | undefined) ?? {};
      return (
        <div className="space-y-2">
          {item.rows.map((row) => (
            <fieldset key={row}>
              <legend>{row}</legend>
              <ul className="flex flex-wrap gap-2">
                {item.options.map((label, i) => (
                  <Choice key={label} label={label} selected={grid[row] === i} onClick={() => setDraft({ ...grid, [row]: i })} />
                ))}
              </ul>
            </fieldset>
          ))}
          <button className="border px-2" disabled={Object.keys(grid).length === 0} onClick={() => onAnswer(grid, true)}>
            Save and continue
          </button>
        </div>
      );
    }
    case "TXT": {
      const text = typeof draft === "string" ? draft : "";
      return (
        <div className="space-y-2">
          <label className="block">
            <span className="sr-only">Your answer</span>
            <textarea className="w-full border p-1" rows={3} value={text} onChange={(e) => setDraft(e.target.value)} />
          </label>
          <button className="border px-2" onClick={() => (text.trim() ? onAnswer(text.trim(), true) : onNext())}>
            Save and continue
          </button>
        </div>
      );
    }
  }
}

function Result({ answers, seed, onBack }: { answers: Answers; seed: number; onBack: () => void }) {
  const content = useMemo(() => getContent(), []);
  const result = useMemo(() => score(content, answers), [content, answers]);
  const view = useMemo(() => resultView(content, getCopy(), result, answers), [content, result, answers]);
  const [other, setOther] = useState("");
  let comparison: string;
  if (!other.trim()) {
    comparison = "Paste another answers JSON above to compare.";
  } else {
    try {
      const b = JSON.parse(other) as Answers;
      const cmp = compare(content, answers, b);
      comparison = JSON.stringify({ raw: cmp, words: compareView(content, cmp, result, score(content, b)) }, null, 1);
    } catch (e) {
      comparison = `Could not parse: ${String(e)}`;
    }
  }

  return (
    <section className="space-y-4">
      <button className="border px-2" onClick={onBack}>
        Back to the last question
      </button>
      <h2 className="font-bold">Result in words (lib/results)</h2>
      <pre className="overflow-x-auto whitespace-pre-wrap border p-2">{JSON.stringify(view, null, 1)}</pre>
      <h2 className="font-bold">Raw result</h2>
      <pre className="overflow-x-auto border p-2">{JSON.stringify(result, null, 1)}</pre>
      <h2 className="font-bold">Answers (seed {seed})</h2>
      <pre className="overflow-x-auto border p-2">{JSON.stringify(answers, null, 1)}</pre>
      <h2 className="font-bold">Compare with another answer set</h2>
      <label className="block">
        <span>Other answers (JSON)</span>
        <textarea className="w-full border p-1" rows={4} value={other} onChange={(e) => setOther(e.target.value)} />
      </label>
      <pre className="overflow-x-auto border p-2">{comparison}</pre>
    </section>
  );
}
