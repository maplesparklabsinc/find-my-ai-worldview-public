// Results render under the content release they were scored with (CLAUDE.md
// non-negotiable 4). Frozen releases live in lib/content/releases.
import { describe, expect, it } from "vitest";
import copyJson from "@/content/copy.json";
import itemsJson from "@/content/items.json";
import narrativesJson from "@/content/narratives.json";
import perspectivesJson from "@/content/perspectives.json";
import scoringConfigJson from "@/content/scoring-config.json";
import baseRatesJson from "@/content/base-rates.json";
import vectors from "@/reference/test-vectors.json";
import { contentVersions, getContent } from "@/lib/content";
import { fromRaw, loadRelease, releaseKey } from "@/lib/content/release";
import { releases } from "@/lib/content/releases";
import { resultView } from "@/lib/results";
import { score, type Answers } from "@/lib/scoring";

// The "accelerator" answers from the 0.3.0 item bank's test vectors (main, before content v0.4).
const answers030: Answers = {
  "C1-01": 6, "C1-02": 6, "C1-04": 6, "C1-05": 2, "C1-06": 2, "D3:C1": 1,
  "C2-01": 3, "C2-03": 3, "C2-04": 3, "C2-05": 5, "C2-06": 5, "D3:C2": 1,
  "C3-01": 2, "C3-02": 2, "C3-03": 2, "C3-05": 6, "C3-06": 6, "D3:C3": 1,
  "C4-01": 2, "C4-02": 2, "C4-03": 2, "C4-05": 6, "C4-06": 6, "D3:C4": 1,
  "C5-01": 3, "C5-02": 3, "C5-03": 3, "C5-05": 5, "C5-07": 5, "D3:C5": 1,
  "C6-01": 4, "C6-02": 4, "C6-04": 4, "C6-05": 4, "C6-06": 4, "D3:C6": 1,
  D8: 1, D11: 0,
};
const KEY_030 = "0.1.0-0.1.0-0.3.0-0.2.1";

describe("content releases", () => {
  it("the current content is frozen, unchanged (run npm run content:freeze after a version bump)", () => {
    const key = releaseKey(contentVersions(getContent()));
    const frozen = releases[key];
    expect(frozen, `release ${key} is not frozen`).toBeDefined();
    expect(frozen).toEqual({
      items: itemsJson,
      config: scoringConfigJson,
      perspectives: perspectivesJson,
      narratives: narrativesJson,
      baseRates: baseRatesJson,
      copy: { countries: copyJson.countries, evidence_sources: copyJson.evidence_sources },
    });
  });

  it("renders a stored 0.3.0 result with 0.3.0 wording", async () => {
    const release = (await loadRelease({ scoring: "0.1.0", taxonomy: "0.1.0", item_bank: "0.3.0", narratives: "0.2.1" }))!;
    expect(release.key).toBe(KEY_030);
    // As saved at the time: scored with the 0.3.0 content.
    const stored = score(release.content, answers030);
    expect(stored.versions.item_bank).toBe("0.3.0");
    const view = resultView(release.content, release.copy, stored, answers030);

    expect(view.tracks.find((t) => t.construct === "C3")!.question).toBe("How fast should AI move?");
    expect(view.ranking.map((p) => p.name)).toContain("Fair-Share Advocates");
    // C3-05 changed meaning in 0.4.0; the old agreement must show the old statement.
    const text = [...view.statements.commonGround, view.statements.unexpected, view.statements.difference].join(" ");
    expect(text).toContain("delaying AI has real costs");
    expect(text).not.toContain("released while safety testing continues");
  });

  it("keeps each release's own trust-grid labels (D4 is keyed by row label)", async () => {
    const before = (await loadRelease({ scoring: "0.3.0", taxonomy: "0.2.1", item_bank: "0.4.2", narratives: "0.5.0" }))!;
    expect(before.content.itemsById.get("D4")!.rows).toContain("International bodies");
    const rows = getContent().itemsById.get("D4")!.rows;
    expect(rows).toContain("International organizations, such as the UN");
    expect(rows).not.toContain("International bodies");
    // The tension rules that read D4 use today's labels.
    for (const t of getContent().narratives.tensions)
      for (const cond of t.when) if ("trust_low" in cond) expect(rows).toContain(cond.trust_low);
  });

  it("keeps six perspectives and no outside names for results saved before taxonomy 0.3.0 (issue #39)", async () => {
    const before = (await loadRelease({ scoring: "0.4.0", taxonomy: "0.2.2", item_bank: "0.8.0", narratives: "0.6.0" }))!;
    // Item bank 0.8.0 is unchanged, so today's test-vector answers fit it.
    const answers = vectors.score_cases.find((v) => v.id === "accelerator")!.answers as Answers;
    const view = resultView(before.content, before.copy, score(before.content, answers), answers);
    expect(view.ranking).toHaveLength(6);
    expect(view.ranking.map((p) => p.id)).not.toContain("skeptics");
    expect(view.ranking.every((p) => p.elsewhere === null)).toBe(true);
    expect(getContent().perspectives.perspectives.every((p) => p.elsewhere)).toBe(true);
  });

  it("has no release for versions that were never frozen", async () => {
    expect(await loadRelease({ scoring: "9.9.9", taxonomy: "0.1.0", item_bank: "0.3.0", narratives: "0.2.1" })).toBeNull();
  });

  it("uses today's labels with the release's countries and source lines", () => {
    const r = fromRaw(KEY_030, releases[KEY_030]);
    expect(r.copy.share).toBeDefined();
    expect(r.copy.evidence_sources).toEqual((releases[KEY_030].copy as { evidence_sources: object }).evidence_sources);
  });
});
