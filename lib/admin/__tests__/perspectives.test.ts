// The perspectives reference page (/admin/perspectives, issue #16) must show
// everything the content files say about each perspective and outcome.
import { describe, expect, it } from "vitest";
import perspectivesJson from "@/content/perspectives.json";
import narrativesJson from "@/content/narratives.json";
import {
  SHOWN_FILE_FIELDS,
  SHOWN_PERSPECTIVE_FIELDS,
  buildPerspectivesReference,
  newestChange,
  weightWords,
} from "@/lib/admin/perspectives";
import { getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { loadReleaseByKey, releaseKeys } from "@/lib/content/release";

const c = getContent();
const copy = getCopy();
const d = buildPerspectivesReference(c, copy);

describe("perspectives reference", () => {
  it("shows every field of perspectives.json (add new fields to the page, then to SHOWN_*)", () => {
    expect(Object.keys(perspectivesJson).filter((k) => !(SHOWN_FILE_FIELDS as readonly string[]).includes(k))).toEqual([]);
    for (const p of perspectivesJson.perspectives) {
      expect(Object.keys(p).filter((k) => !(SHOWN_PERSPECTIVE_FIELDS as readonly string[]).includes(k)), p.id).toEqual([]);
    }
  });

  it("shows every perspective, in file order, with all its wording", () => {
    expect(d.perspectives.map((p) => p.id)).toEqual(perspectivesJson.perspectives.map((p) => p.id));
    for (const p of c.perspectives.perspectives) {
      const e = d.perspectives.find((x) => x.id === p.id)!;
      expect(e.name).toBe(p.name);
      expect(e.tagline).toBe(p.tagline);
      expect(e.cardSummary).toBe(p.card_summary);
      expect(e.description).toBe(p.description);
      expect(e.strongestObjection).toBe(p.strongest_objection);
      expect(e.discussionPrompt).toBe(p.discussion_prompt);
      expect(e.evidence.map((x) => x.ref)).toEqual(p.evidence_refs ?? []);
      expect(e.positions.map((x) => [x.construct, x.rawPrototype, x.rawWeight])).toEqual(
        c.config.scored_constructs.map((k) => [k, p.prototype[k], p.weight[k]]),
      );
      expect(e.changed).toBeNull();
    }
  });

  it("shows every signature statement in full, with its direction and ID", () => {
    for (const p of c.perspectives.perspectives) {
      const e = d.perspectives.find((x) => x.id === p.id)!;
      expect(e.signatures).toEqual(
        p.signatures.map((s) => ({
          item: s.item,
          direction: s.direction === "agree" ? "Agrees" : "Disagrees",
          text: c.itemsById.get(s.item)!.stem,
        })),
      );
    }
  });

  it("words positions the way the result page does, and weights in words", () => {
    const stewards = d.perspectives.find((p) => p.id === "stewards")!;
    expect(stewards.positions.find((x) => x.construct === "C4")!.band).toBe('Strongly toward "Public regulators"');
    expect(stewards.positions.find((x) => x.construct === "C4")!.weight).toBe("defining");
    expect([0, 0.25, 0.5, 0.75, 1, 1.5, 1.99, 2, 2.5].map(weightWords)).toEqual([
      "not part of it",
      "minor",
      "minor",
      "part of it",
      "part of it",
      "important",
      "important",
      "defining",
      "defining",
    ]);
  });

  it("shows every outcome in narratives.json with all its wording and source lines", () => {
    expect(d.outcomes.map((o) => o.id).sort()).toEqual(Object.keys(narrativesJson.outcomes).sort());
    for (const [id, o] of Object.entries(narrativesJson.outcomes)) {
      const e = d.outcomes.find((x) => x.id === id)!;
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === "string") expect(e.fields.find((f) => f.key === k)?.text, `${id}.${k}`).toBe(v);
      }
      const refs = (o as { evidence_refs?: string[] }).evidence_refs ?? [];
      expect(e.sources.map((s) => s.ref)).toEqual(refs);
      for (const s of e.sources) expect(s.line, `${id} ${s.ref}`).not.toBeNull();
    }
    const forming = d.outcomes.find((o) => o.id === "undecided")!;
    expect(forming.fields.map((f) => f.key).slice(0, 5)).toEqual(["headline", "body", "coverage_body", "middle_headline", "middle_body"]);
  });

  it("shows every user-facing string in narratives.json somewhere on the page", () => {
    // Not user-facing: the version, the voice guide, build notes, and tension IDs and rules.
    const skip = (path: string[]) =>
      ["narratives_version", "voice"].includes(path[0]) ||
      (path[0] === "statements" && path[1] === "note") ||
      (path[0] === "tensions" && (path[2] === "id" || path[2] === "when")) ||
      path.includes("evidence_refs");
    const wanted: [string, string][] = [];
    const walk = (v: unknown, path: string[]) => {
      if (typeof v === "string") {
        if (!skip(path)) wanted.push([path.join("."), v]);
      } else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) walk(x, [...path, k]);
      }
    };
    walk(narrativesJson, []);
    const shown = new Set<string>();
    const collect = (v: unknown) => {
      if (typeof v === "string") shown.add(v);
      else if (v && typeof v === "object") Object.values(v).forEach(collect);
    };
    collect(d);
    expect(wanted.length).toBeGreaterThan(50);
    expect(wanted.filter(([, text]) => !shown.has(text)).map(([path]) => path)).toEqual([]);
    const matched = d.outcomes.find((o) => o.id === "matched")!;
    expect(matched.fields.find((f) => f.key === "unsettled_note")?.text).toBe(narrativesJson.unsettled_note);
  });

  it("lists the candidates, the status and the versions", () => {
    expect(d.candidates).toEqual(perspectivesJson.candidates_not_scored);
    expect(d.status).toBe(perspectivesJson.status);
    expect(d.taxonomy).toBe(perspectivesJson.taxonomy_version);
    expect(d.narratives).toBe(narrativesJson.narratives_version);
    expect(newestChange(copy)).toContain(copy.changelog.entries[0].version);
  });

  it("renders every frozen release, marking what changed since", async () => {
    const keys = await releaseKeys();
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const r = (await loadReleaseByKey(key))!;
      const old = buildPerspectivesReference(r.content, r.copy, c);
      expect(old.perspectives.length, key).toBe(r.content.perspectives.perspectives.length);
      for (const p of old.perspectives) {
        expect(p.signatures.every((s) => s.text !== "(statement not found)"), `${key} ${p.id}`).toBe(true);
        expect(p.changed).not.toBeNull();
      }
    }
    // 0.1.0 called them Fair-Share Advocates.
    const first = buildPerspectivesReference((await loadReleaseByKey("0.1.0-0.1.0-0.3.0-0.2.1"))!.content, copy, c);
    expect(first.perspectives.find((p) => p.id === "fair_share")!.changed).toContain("name");
  });

  it("finds no release for keys that aren't frozen, including object built-ins", async () => {
    for (const key of ["nope", "__proto__", "constructor", "toString"]) expect(await loadReleaseByKey(key)).toBeNull();
  });
});
