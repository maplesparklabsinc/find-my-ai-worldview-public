// Issue #55, section 1: the anonymous export.
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import vectors from "@/reference/test-vectors.json";
import { buildExport, csvCell, itemColumns, parseDate, zipExport, type ExportFeedbackRaw, type ExportResponseRaw } from "@/lib/admin/export";
import { statementKeys } from "@/lib/admin/quality";
import { contentVersions, getContent } from "@/lib/content";
import type { Answers } from "@/lib/scoring";

const c = getContent();
const v = contentVersions(c);
const at = "@";
const typed = `reader${at}example.com`;

function response(over: Partial<ExportResponseRaw> = {}): ExportResponseRaw {
  return {
    id: "abcdefghijklmn",
    completed_on: "2026-10-16",
    scoring_version: v.scoring,
    taxonomy_version: v.taxonomy,
    item_bank_version: v.item_bank,
    narratives_version: v.narratives,
    form: c.config.form,
    answer_direction: "agree_first",
    answers: vectors.score_cases.find((x) => x.id === "steward")!.answers as Answers,
    free_text: { D9: `Write to me at ${typed}, thanks` },
    timings_ms: Object.fromEntries(statementKeys(c).map((k) => [k, 6_000])),
    outcome_type: "mixed_between",
    outcome_reason: null,
    closest_perspective: "stewards",
    first: "stewards",
    second: "pragmatists",
    bands: { C1: "lean_high", C2: null },
    country: "CA",
    fit_rating: 4,
    better_fit: null,
    track_checks: { C1: "about_right" },
    prediction_kind: "between",
    prediction_perspectives: ["pragmatists", "stewards"],
    quick_check_shown: null,
    quick_check_perspective: null,
    quick_check_rating: null,
    compared_with: null,
    research_active: true,
    ...over,
  };
}

const feedback: ExportFeedbackRaw[] = [
  { created_on: "2026-10-15", type: "other", item_ids: ["C3-02"], perspective_ids: [], body: `=SUM(A1) reply to ${typed}`, may_quote: true, response_id: null, has_email: true },
];

/** A small CSV reader for these tests: quoted cells, doubled quotes. */
function parse(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && csv[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += ch;
  }
  return rows;
}

describe("export", () => {
  const files = buildExport(c, [response(), response({ id: "zzzzzzzzzzzzzz", outcome_type: "matched", research_active: false, answers: Object.fromEntries(statementKeys(c).map((k) => [k, 4])), timings_ms: {} })], feedback, {
    date: "2026-10-16",
    release: "all",
    from: null,
    to: "2026-10-16",
  });
  const header = files["responses.csv"].split("\r\n")[0].split(",");

  it("never contains an email address, a key or a token", () => {
    for (const text of Object.values(files)) {
      expect(text).not.toContain(typed);
      expect(text).not.toMatch(/submission_key|edit_token/);
    }
    expect(header.filter((h) => /email/i.test(h))).toEqual([]);
    expect(files["responses.csv"]).toContain("[email removed]");
    expect(files["feedback.csv"]).toContain("[email removed]");
  });

  it("has the columns the issue lists, bands not scores, and every item in canonical order", () => {
    for (const col of ["id", "completed_on", "scoring_version", "answer_direction", "outcome_type", "closest_perspective", "between_1", "between_2", "band_C1", "band_C6", "country", "fit_rating", "better_fit", "track_checks", "guess", "guess_matched", "quick_check_shown", "compared_with", "research", "flag_too_fast", "flag_same_answer"]) {
      expect(header, col).toContain(col);
    }
    expect(header.filter((h) => /score|distance/i.test(h))).toEqual([]);
    const items = itemColumns(c, []);
    expect(header.slice(8, 8 + items.length)).toEqual(items);
    expect(items[0]).toBe("C1-01");
    expect(items).toContain("D3:C1");
  });

  it("fills between_1 and between_2 for In between only, research as yes / withdrawn / no, and the flags", () => {
    const [h, a, b] = parse(files["responses.csv"]);
    expect(a).toHaveLength(h.length);
    const col = (row: string[], name: string) => row[h.indexOf(name)];
    expect([col(a, "between_1"), col(a, "between_2")]).toEqual(["pragmatists", "stewards"]);
    expect([col(b, "between_1"), col(b, "between_2")]).toEqual(["", ""]);
    expect([col(a, "research"), col(b, "research")]).toEqual(["yes", "withdrawn"]);
    expect([col(a, "flag_same_answer"), col(b, "flag_same_answer")]).toEqual(["no", "yes"]);
    // Guessed In between Pragmatists and Stewards, and landed there.
    expect(col(a, "guess_matched")).toBe("yes");
    expect(col(a, "band_C1")).toBe("lean_high");
    expect(col(a, "band_C2")).toBe("");
  });

  it("README: one line per column, and the caveat", () => {
    expect(files["README.txt"]).toContain("Self-selected respondents; not representative.");
    for (const h of header) expect(files["README.txt"]).toContain(`\r\n${h}: `);
    expect(files["README.txt"]).toContain("Completion dates: the start to 2026-10-16.");
  });

  it("escapes CSV and defuses spreadsheet formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell(-1)).toBe("-1");
    expect(csvCell(null)).toBe("");
    expect(csvCell({ choice: 0, strength: "slightly" })).toBe('"{""choice"":0,""strength"":""slightly""}"');
    expect(files["feedback.csv"]).toContain("'=SUM(A1)");
  });

  it("zips the three files", () => {
    const out = unzipSync(zipExport(files));
    expect(Object.keys(out).sort()).toEqual(["README.txt", "feedback.csv", "responses.csv"]);
    expect(strFromU8(out["responses.csv"])).toBe(files["responses.csv"]);
  });

  it("dates from the URL", () => {
    expect(["2026-10-01", "2026-13-01", "yesterday", undefined].map(parseDate)).toEqual(["2026-10-01", null, null, null]);
  });
});
