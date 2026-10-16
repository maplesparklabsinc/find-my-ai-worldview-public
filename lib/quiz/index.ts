// Quiz progress kept in the browser (sessionStorage) until the end, so a
// refresh does not lose answers (docs/01-product-spec.md 5.3). Pure helpers
// plus a small storage wrapper; nothing here leaves the browser.
import type { Answers, AnswerValue } from "@/lib/scoring";
import { isValidSeed } from "@/lib/form";
import { predictionSchema, type Prediction } from "@/lib/prediction";

export const STORAGE_KEY = "fmaw-quiz-v1";
export const LARGER_TEXT_KEY = "fmaw-larger-text";

export interface QuizState {
  v: 1;
  seed: number;
  /** Index of the current step. Equal to the number of steps once finished. */
  index: number;
  answers: Answers;
  /** Time spent on each step, in ms, summed over visits. */
  timings: Record<string, number>;
  finished: boolean;
  /** Times each answer was changed after going Back (docs/01-product-spec.md 6.1). */
  changes?: Record<string, number>;
  /** The guess made after the last question, or a skip (issue #24). Asked before the quick check. */
  prediction?: Prediction;
  /** The quick-check rating, once given (docs/04 section 6). */
  quickCheck?: { shown: "own" | "other"; perspective: string; rating: number };
  /**
   * Sent with the save so the server stores this quiz once, however many times
   * it is sent (issue #18). Set when saving starts.
   */
  submissionKey?: string;
}

/**
 * A random version 4 UUID. crypto.randomUUID() needs a secure context, which a
 * phone testing over the LAN (npm run dev:lan, plain http) doesn't have.
 */
export function newSubmissionKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newQuiz(seed: number): QuizState {
  return { v: 1, seed, index: 0, answers: {}, timings: {}, finished: false };
}

/** Set or clear (undefined = skipped) the answer for a step. */
export function setAnswer(s: QuizState, key: string, value: AnswerValue | undefined): QuizState {
  const answers = { ...s.answers };
  const before = answers[key];
  if (value === undefined) delete answers[key];
  else answers[key] = value;
  if (!isChange(before, value)) return { ...s, answers };
  return { ...s, answers, changes: { ...s.changes, [key]: (s.changes?.[key] ?? 0) + 1 } };
}

/**
 * True when an earlier answer is replaced or removed (only possible after Back).
 * The trust grid fills in row by row, so adding rows is not a change; altering
 * a row already answered is.
 */
export function isChange(before: AnswerValue | undefined, after: AnswerValue | undefined): boolean {
  if (before === undefined) return false;
  if (after === undefined) return true;
  if (typeof before === "object" && typeof after === "object") {
    const a = before as Record<string, unknown>;
    const b = after as Record<string, unknown>;
    return Object.keys(a).some((k) => a[k] !== b[k]);
  }
  return before !== after;
}

export function goTo(s: QuizState, index: number, stepCount: number): QuizState {
  const i = Math.max(0, Math.min(stepCount, index));
  return { ...s, index: i, finished: s.finished || i >= stepCount };
}

export function addTime(s: QuizState, key: string, ms: number): QuizState {
  if (!(ms > 0)) return s;
  return { ...s, timings: { ...s.timings, [key]: (s.timings[key] ?? 0) + Math.round(ms) } };
}

function isQuizState(x: unknown): x is QuizState {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<QuizState>;
  return (
    s.v === 1 &&
    typeof s.seed === "number" &&
    isValidSeed(s.seed) &&
    typeof s.index === "number" &&
    typeof s.answers === "object" &&
    s.answers !== null &&
    typeof s.timings === "object" &&
    s.timings !== null &&
    typeof s.finished === "boolean"
  );
}

export function loadQuiz(): QuizState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!isQuizState(parsed)) return null;
    // A guess that doesn't parse is asked again rather than sent and refused.
    if (parsed.prediction !== undefined && !predictionSchema.safeParse(parsed.prediction).success) {
      return { ...parsed, prediction: undefined };
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveQuiz(s: QuizState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage can be unavailable (private mode); the quiz still works for this page view.
  }
}

export function clearQuiz(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function loadLargerText(): boolean {
  try {
    return sessionStorage.getItem(LARGER_TEXT_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveLargerText(on: boolean): void {
  try {
    sessionStorage.setItem(LARGER_TEXT_KEY, on ? "1" : "0");
  } catch {
    // Remembered for this page view only.
  }
}

// ---------- Around the quiz ----------
// Small per-browser notes. Each read and write tolerates storage being unavailable.

/** Set by a compare link (/c/{id}): the response the next completed quiz compares with. */
export const COMPARE_KEY = "fmaw-compare-with";
/**
 * Results saved from this browser, with their edit tokens (result ID -> token).
 * The token is what lets this browser, and only this one, change a result.
 */
export const MINE_KEY = "fmaw-mine-v2";
/** One-time note for the result page after a quick check: "own" or "other". */
export const quickCheckNoteKey = (id: string) => `fmaw-qc-${id}`;
/** Result feedback this browser has saved for a result, so a reload shows it (issue #18). */
export const feedbackGivenKey = (id: string) => `fmaw-fb-${id}`;
/** The guess made before a result, kept in this browser only so the owner sees it beside the result (issue #24). */
export const predictionKey = (id: string) => `fmaw-guess-${id}`;

function read(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

function write(store: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {
    // Not remembered; everything still works for this page view.
  }
}

const session = () => sessionStorage;
const local = () => localStorage;

export const loadCompareWith = () => read(session, COMPARE_KEY);
export const saveCompareWith = (id: string | null) => write(session, COMPARE_KEY, id);

export const loadQuickCheckNote = (id: string) => read(session, quickCheckNoteKey(id));
export const saveQuickCheckNote = (id: string, shown: "own" | "other" | null) => write(session, quickCheckNoteKey(id), shown);

export function loadPredictionNote(id: string): Prediction | null {
  try {
    const r = predictionSchema.safeParse(JSON.parse(read(local, predictionKey(id)) ?? "null"));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export const savePredictionNote = (id: string, p: Prediction | null) => write(local, predictionKey(id), p ? JSON.stringify(p) : null);

function loadMine(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(read(local, MINE_KEY) ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}

/** The edit token for a result saved in this browser, or null. */
export function editToken(id: string): string | null {
  return loadMine()[id] ?? null;
}

export function isMine(id: string): boolean {
  return editToken(id) !== null;
}

/** Remember a saved result and its token. Keeps the 20 most recent. */
export function addMine(id: string, token: string): void {
  const entries = Object.entries(loadMine()).filter(([k]) => k !== id);
  write(local, MINE_KEY, JSON.stringify(Object.fromEntries([...entries, [id, token]].slice(-20))));
}

export interface FeedbackGiven {
  fit_rating?: number;
  better_fit?: string;
  track_checks?: Record<string, string>;
}

/** Result feedback saved from this browser for result `id`. */
export function loadFeedbackGiven(id: string): FeedbackGiven {
  try {
    const v: unknown = JSON.parse(read(local, feedbackGivenKey(id)) ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const f = v as Record<string, unknown>;
    const checks = f.track_checks;
    return {
      ...(typeof f.fit_rating === "number" ? { fit_rating: f.fit_rating } : {}),
      ...(typeof f.better_fit === "string" ? { better_fit: f.better_fit } : {}),
      ...(checks && typeof checks === "object" && !Array.isArray(checks)
        ? { track_checks: Object.fromEntries(Object.entries(checks).filter((e): e is [string, string] => typeof e[1] === "string")) }
        : {}),
    };
  } catch {
    return {};
  }
}

/** Remember feedback that the server accepted. Track checks merge, like the server's. */
export function saveFeedbackGiven(id: string, patch: FeedbackGiven): void {
  const now = loadFeedbackGiven(id);
  const next = { ...now, ...patch, track_checks: { ...now.track_checks, ...patch.track_checks } };
  write(local, feedbackGivenKey(id), JSON.stringify(next));
}
