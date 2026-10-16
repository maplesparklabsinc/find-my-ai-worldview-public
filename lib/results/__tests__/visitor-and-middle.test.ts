// Issue #21: the middle result, visitor headlines and the reworded share and compare copy.
import { describe, expect, it } from "vitest";
import vectors from "@/reference/test-vectors.json";
import { getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { isSharedView, resultView, shareText, sharedResultPath } from "@/lib/results";
import { score, type Answers } from "@/lib/scoring";

const c = getContent();
const copy = getCopy();
const answersOf = (id: string) => vectors.score_cases.find((v) => v.id === id)!.answers as Answers;
const viewOf = (id: string) => resultView(c, copy, score(c, answersOf(id)), answersOf(id));

describe("in the middle on every question", () => {
  it("renders its own headline, body and share line, with no source line", () => {
    const v = viewOf("all_neither_settled");
    const u = c.narratives.outcomes.undecided;
    expect(v.outcome).toBe("undecided");
    expect(v.undecidedReason).toBe("middle");
    expect(v.headline).toBe(u.middle_headline);
    expect(v.subhead).toBe(u.middle_body);
    expect(v.subheadSources).toEqual([]);
    expect(v.detail.type).toBe("undecided");
    expect(shareText(copy, v)).toBe(copy.share.text.undecided_middle.replace("{site}", copy.site.name));
  });

  it("leaves the confidence result's wording alone", () => {
    const v = viewOf("all_neither_unsettled");
    expect(v.undecidedReason).toBe("confidence");
    expect(v.headline).toBe(c.narratives.outcomes.undecided.headline);
    expect(v.subhead).toBe(c.narratives.outcomes.undecided.body);
  });
});

describe("one wording for everyone (issue #37)", () => {
  it("has no visitor versions: a visitor reads the result as written for its owner", () => {
    const text = JSON.stringify(c.narratives.outcomes) + JSON.stringify(copy.results);
    expect(text).not.toMatch(/visitor_|"visitor"/);
    expect(viewOf("steward").headline).toBe("Your closest perspective: Stewards");
  });
});

describe("one question count everywhere (issue #37)", () => {
  it("fills {n} from the standard form instead of saying 'about 50'", () => {
    expect(copy.landing.lede).not.toMatch(/\d/);
    expect(copy.landing.facts[0]).toBe("{n} quick questions");
    expect(copy.landing.steps[0]).toContain("{n}");
    expect(copy.result_page.take_it_body).toContain("{n}");
    expect(JSON.stringify(copy).toLowerCase()).not.toContain("about 50");
  });
});

describe("share and compare copy", () => {
  it("says closest for a matched result, and never promises you'll both see", () => {
    expect(shareText(copy, viewOf("steward"))).toContain("closest");
    const compare = JSON.stringify(copy.compare).toLowerCase();
    expect(compare).not.toContain("you'll both see");
    expect(compare).not.toContain("you’ll both see");
  });
});

describe("the shared link (issue #37)", () => {
  it("is the read-only view, and survives share text pasted on the end", () => {
    expect(sharedResultPath("abcdefghijklmn")).toBe("/r/abcdefghijklmn?view=shared");
    expect(isSharedView("shared")).toBe(true);
    expect(isSharedView("shared I landed between Pragmatists and Accelerators on Find My AI Worldview.")).toBe(true);
    expect(isSharedView(["shared", "x"])).toBe(true);
    for (const v of [undefined, "", "owner", "share", []]) expect(isSharedView(v as string | string[] | undefined)).toBe(false);
  });
});
