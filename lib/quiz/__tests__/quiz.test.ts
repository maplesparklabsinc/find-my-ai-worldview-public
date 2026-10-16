import { beforeEach, describe, expect, it } from "vitest";
import {
  addTime,
  goTo,
  loadFeedbackGiven,
  loadQuiz,
  newQuiz,
  newSubmissionKey,
  saveFeedbackGiven,
  saveQuiz,
  setAnswer,
  STORAGE_KEY,
} from "@/lib/quiz";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe("quiz state", () => {
  beforeEach(() => {
    (globalThis as { sessionStorage?: unknown }).sessionStorage = new MemoryStorage();
  });

  it("records, changes and skips answers without mutating", () => {
    const a = newQuiz(7);
    const b = setAnswer(a, "C1-01", 5);
    expect(a.answers).toEqual({});
    expect(setAnswer(b, "C1-01", 2).answers).toEqual({ "C1-01": 2 });
    expect(setAnswer(b, "C1-01", undefined).answers).toEqual({});
  });

  it("clamps navigation and marks the quiz finished at the end", () => {
    const s = newQuiz(7);
    expect(goTo(s, -1, 50).index).toBe(0);
    const done = goTo(s, 50, 50);
    expect(done.finished).toBe(true);
    expect(goTo(done, 10, 50).finished).toBe(true);
  });

  it("sums time per step", () => {
    const s = addTime(addTime(newQuiz(1), "C1-01", 1200.4), "C1-01", 800);
    expect(s.timings["C1-01"]).toBe(2000);
    expect(addTime(s, "X", -5).timings.X).toBeUndefined();
  });

  it("survives a reload and ignores anything malformed", () => {
    const s = setAnswer(newQuiz(99), "D9", "curious");
    saveQuiz(s);
    expect(loadQuiz()).toEqual(s);
    sessionStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadQuiz()).toBeNull();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, seed: -1 }));
    expect(loadQuiz()).toBeNull();
  });
});

describe("answer changes", () => {
  it("counts a replaced or cleared answer, not a first answer or a growing grid", () => {
    let s = newQuiz(1);
    s = setAnswer(s, "C1-01", 3);
    s = setAnswer(s, "C1-01", 3);
    expect(s.changes).toBeUndefined();
    s = setAnswer(s, "C1-01", 5);
    s = setAnswer(s, "C1-01", undefined);
    expect(s.changes).toEqual({ "C1-01": 2 });
    s = setAnswer(s, "D4", { "AI companies": 1 });
    s = setAnswer(s, "D4", { "AI companies": 1, "Government regulators": 2 });
    expect(s.changes?.D4).toBeUndefined();
    s = setAnswer(s, "D4", { "AI companies": 0, "Government regulators": 2 });
    expect(s.changes?.D4).toBe(1);
    s = setAnswer(s, "C3-T1", { choice: 0, strength: "slightly" });
    s = setAnswer(s, "C3-T1", { choice: 0, strength: "strongly" });
    expect(s.changes?.["C3-T1"]).toBe(1);
  });
});

describe("submission key", () => {
  it("is a random version 4 UUID", () => {
    const keys = new Set(Array.from({ length: 500 }, newSubmissionKey));
    expect(keys.size).toBe(500);
    for (const k of keys) expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("feedback given", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  });

  it("remembers what was saved for a result, merging track checks", () => {
    expect(loadFeedbackGiven("abc")).toEqual({});
    saveFeedbackGiven("abc", { fit_rating: 2 });
    saveFeedbackGiven("abc", { track_checks: { C1: "about_right" } });
    saveFeedbackGiven("abc", { better_fit: "none", track_checks: { C2: "further_low" } });
    expect(loadFeedbackGiven("abc")).toEqual({
      fit_rating: 2,
      better_fit: "none",
      track_checks: { C1: "about_right", C2: "further_low" },
    });
    expect(loadFeedbackGiven("other")).toEqual({});
  });

  it("ignores anything malformed", () => {
    localStorage.setItem("fmaw-fb-abc", JSON.stringify({ fit_rating: "5", track_checks: [1], better_fit: 3 }));
    expect(loadFeedbackGiven("abc")).toEqual({});
    localStorage.setItem("fmaw-fb-abc", "{not json");
    expect(loadFeedbackGiven("abc")).toEqual({});
  });
});
