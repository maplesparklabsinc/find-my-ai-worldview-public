#!/usr/bin/env python3
"""Generate reference/test-vectors.json from synthetic personas and check that each
persona lands where its definition says it should.

Personas are synthetic and exist only to test the rules. They say nothing about how
real people answer. Each persona sets a target level per construct (-3..+3); answers
are derived as raw = center + level for forward items and center - level for reverse
items, with an optional per-item jitter so constructs are not perfectly uniform. A
half level (1.5) alternates between the two answers either side of it.

Usage (repo root): python3 -I reference/make_test_vectors.py
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score import Content, score, compare  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
c = Content()
FORM = c.items_bundle["forms"]["S"]
CONSTRUCTS = [b["construct"] for b in FORM["blocks"]]
TRUST = c.items["D4"]["rows"]


def answers_from(levels, jitter=None, confidence=1, salience=1, trust=None, tradeoffs=None, skip=()):
    a = {}
    jitter = jitter or {}
    for b in FORM["blocks"]:
        k = b["construct"]
        for n, iid in enumerate(b["items"]):
            if iid in skip:
                continue
            lvl = levels.get(k, 0) + jitter.get(iid, 0)
            # A half level (1.5) can't be one answer: alternate rounding up and down
            # across the block so the construct's mean lands near it. Other levels
            # round as usual.
            step = math.floor(lvl) + (n % 2 == 0) if lvl % 1 == 0.5 else round(lvl)
            it = c.items[iid]
            raw = 4 + step if it["pole"] == "+" else 4 - step
            a[iid] = int(max(1, min(7, raw)))
        a[f"D3:{k}"] = confidence if isinstance(confidence, int) else confidence.get(k, 1)
    a["D8"] = salience
    a["D4"] = {r: (trust or {}).get(r, 1) for r in TRUST}
    for tid, val in (tradeoffs or {}).items():
        a[tid] = val
    a["D11"] = 0
    return a


PRAGMATIST = {"C1": 1, "C2": 1, "C3": 0, "C4": 1, "C5": 1, "C6": 0}

P = [
    # id, description, kwargs, expected outcome type, expected first perspective (or None), expected tension id (or None = any)
    ("accelerator", "Clear Accelerator",
     dict(levels={"C1": 2, "C2": -1, "C3": -2, "C4": -2, "C5": -1, "C6": 0}), "matched", "accelerators", None),
    ("steward", "Clear Steward: public rules, middle pace",
     dict(levels={"C1": 1, "C2": 1, "C3": 0, "C4": 2, "C5": 1, "C6": 0}), "matched", "stewards", "benefit_and_harm"),
    ("precautionist", "Clear Precautionist with high expected benefit",
     dict(levels={"C1": 2, "C2": 2, "C3": 3, "C4": 2, "C5": 1, "C6": 0}), "matched", "precautionists", "benefit_but_slow"),
    ("human_control", "Clear Human-Control Defender",
     dict(levels={"C1": 0, "C2": 0, "C3": 0, "C4": 0, "C5": 3, "C6": 0}), "matched", "human_control", None),
    ("fair_share", "Clear Fair-Share Advocate who wants speed",
     dict(levels={"C1": 1, "C2": 0, "C3": -1, "C4": 0, "C5": 0, "C6": 3}), "matched", "fair_share", "fast_and_shared"),
    ("pragmatist", "Clear Pragmatist, settled views",
     dict(levels={"C1": 1, "C2": 1, "C3": 0, "C4": 1, "C5": 1, "C6": 0}, confidence=0), "matched", "pragmatists", "benefit_and_harm"),
    ("oversight_no_trust", "Steward who distrusts regulators",
     dict(levels={"C1": 1, "C2": 1, "C3": 0, "C4": 2, "C5": 1, "C6": 0}, trust={"Government regulators": 3}), "matched", "stewards", "oversight_without_trust"),
    # Also answers CX-T1 (item bank 0.6.0), which must not matter. Keeps C3-T1 and CX-T1 in
    # one case, which also keeps the TypeScript type of the imported vector file simple.
    ("caution_then_speed", "Leans precaution on statements but picks speed in the trade-off",
     dict(levels={"C1": 1, "C2": 2, "C3": 2, "C4": 1, "C5": 1, "C6": 0},
          tradeoffs={"C3-T1": {"choice": 1, "strength": "strongly"}, "CX-T1": {"choice": 0, "strength": "slightly"}}),
     "matched", "precautionists", "caution_then_speed"),
    ("indifferent", "Low benefit, low harm, low salience",
     dict(levels={"C1": -1, "C2": -1, "C3": 0, "C4": 0, "C5": 0, "C6": 0}, salience=3), "indifferent", None, None),
    ("undecided_confidence", "Near the middle and unsettled",
     dict(levels={"C1": 0, "C2": 1, "C3": 0, "C4": 0, "C5": 0, "C6": 0}, jitter={"C2-01": -1}, confidence=2), "undecided", None, None),
    ("undecided_coverage", "Skipped most items",
     dict(levels={"C1": 2, "C2": 2, "C3": 2, "C4": 2, "C5": 2, "C6": 2},
          skip=[i for b in FORM["blocks"] if b["construct"] in ("C3", "C4", "C5") for i in b["items"]]), "undecided", None, None),
    ("unsettled_but_strong", "Unsettled but strong answers still gets a perspective",
     dict(levels={"C1": 2, "C2": -1, "C3": -2, "C4": -2, "C5": -1, "C6": 0}, confidence=2), "matched", "accelerators", None),
    ("mixed_between", "Between Precautionists and Human-Control Defenders",
     dict(levels={"C1": 0, "C2": 2, "C3": 2, "C4": 1, "C5": 3, "C6": 0}), "mixed_between", None, None),
    ("mixed_unmatched", "Rare combination: fast, no public rules, humans decide, shared gains, high harm",
     dict(levels={"C1": -2, "C2": 3, "C3": -3, "C4": -3, "C5": 3, "C6": 3}), "mixed_unmatched", None, None),
    # Scoring 0.3.0 (issue #21).
    ("tie_exactly_0_2", "Two closest distances 1.1699 and 1.3699: a gap of exactly 0.2 after rounding is a match",
     dict(levels={"C1": 2, "C2": 1, "C3": -3, "C4": 1, "C5": -3, "C6": 2},
          jitter={"C1-04": 1, "C2-04": -1, "C2-06": 1, "C3-01": -1, "C3-02": 1, "C3-06": -1, "C6-09": -1}),
     "matched", "fair_share", None),
    ("tie_just_under", "Two closest distances 1.1091 and 1.3090: a gap of 0.1999 is in between",
     dict(levels={"C1": 1, "C2": 3, "C3": 0, "C4": 3, "C5": -2, "C6": 2},
          jitter={"C1-04": 1, "C1-05": -1, "C2-01": 1, "C3-09": -1, "C3-10": -1, "C4-09": -1, "C4-02": -1, "C4-03": 1,
                  "C4-06": 1, "C5-02": 1, "C5-10": -1, "C5-11": 1, "C6-02": 1, "C6-09": -1}),
     "mixed_between", None, None),
    ("somewhat_important_low_c1_c2", "Low benefit and harm, but AI is \"Somewhat important\": goes on to matching",
     dict(levels={"C1": -1, "C2": -1, "C3": 0, "C4": 0, "C5": 0, "C6": 0}, salience=2), "matched", None, None),
    ("not_very_important_low_c1_c2", "Low benefit and harm, and AI is \"Not very important\": not a priority",
     dict(levels={"C1": -1, "C2": -1, "C3": 0, "C4": 0, "C5": 0, "C6": 0}, salience=3), "indifferent", None, None),
    ("all_neither_settled", "\"Neither\" to every statement, views settled: in the middle on every question",
     dict(levels={}, confidence=0), "undecided", None, None, "middle"),
    ("all_neither_unsettled", "\"Neither\" to every statement, views still forming: the confidence check comes first",
     dict(levels={}, confidence=2), "undecided", None, None, "confidence"),
    # Scoring 0.4.0 (issue #31, synthetic pretest). "not:" means any outcome except that one.
    ("low_interest", "Not very important, benefit and harm both in the middle band: not a priority",
     dict(levels={}, jitter={"C1-01": -1, "C2-01": 1}, salience=3), "indifferent", None, None),
    ("low_interest_harm_high", "Not very important, but expected harm 0.6: not \"Not a priority\"",
     dict(levels={}, jitter={"C1-01": -1, "C2-01": 1, "C2-03": 1, "C2-04": 1}, salience=3), "not:indifferent", None, None),
    ("unconsidered_four", "Four themes \"Not something I have thought about\", mild agreement everywhere: still forming",
     dict(levels={k: 1 for k in ["C1", "C2", "C3", "C4", "C5", "C6"]},
          confidence={"C1": 3, "C2": 3, "C3": 3, "C4": 3, "C5": 1, "C6": 1}), "undecided", None, None, "confidence"),
    ("unconsidered_three", "Three themes \"Not something I have thought about\", otherwise the same: goes on to matching",
     dict(levels={k: 1 for k in ["C1", "C2", "C3", "C4", "C5", "C6"]},
          confidence={"C1": 3, "C2": 3, "C3": 3, "C4": 1, "C5": 1, "C6": 1}), "not:undecided", None, None),
    # Item bank 0.6.0 (issue #33), reworded in 0.7.0 (#35): CX-T1 is collected but not scored. The same Pragmatist
    # answering it either way, or skipping it, gets exactly the same result (checked below).
    ("cx_depends", "Pragmatist who says low-risk AI should be left mostly alone (CX-T1, strongly)",
     dict(levels=PRAGMATIST, confidence=0, tradeoffs={"CX-T1": {"choice": 0, "strength": "strongly"}}), "matched", "pragmatists", "benefit_and_harm"),
    ("cx_basic_rules", "Same answers, but a basic set of rules for all AI (CX-T1, strongly)",
     dict(levels=PRAGMATIST, confidence=0, tradeoffs={"CX-T1": {"choice": 1, "strength": "strongly"}}), "matched", "pragmatists", "benefit_and_harm"),
    ("cx_skipped", "Same answers, CX-T1 skipped",
     dict(levels=PRAGMATIST, confidence=0), "matched", "pragmatists", "benefit_and_harm"),
    # Taxonomy 0.3.0 (issue #39): Skeptics. D8 has no "Very important"; the issue's
    # "Very important" is read as its top option, "Among the most important" (0).
    ("skeptic", "Clear Skeptic: little benefit expected, real costs now",
     dict(levels={"C1": -2, "C2": 1.5, "C3": 1.5, "C4": 1, "C5": 1, "C6": 1}, salience=0, confidence=0),
     "matched", "skeptics", None),
    ("precautionist_not_skeptic", "Worried but still expects some benefit: Precautionists, not Skeptics",
     dict(levels={"C1": 0.5, "C2": 2, "C3": 2, "C4": 1.5, "C5": 1, "C6": 0.5}), "matched", "precautionists", None),
    # Taxonomy 0.3.1 (issue #41): where skeptics actually answer in the synthetic check.
    ("skeptic_protective", "Skeptic who concedes narrow uses and is strongly protective on everything else",
     dict(levels={"C1": -1, "C2": 2, "C3": 2, "C4": 2, "C5": 2, "C6": 2}, salience=0, confidence=0),
     "matched", "skeptics", None),
]
CX_CASES = ["cx_depends", "cx_basic_rules", "cx_skipped"]


def main():
    vectors, failures = [], []
    for pid, desc, kw, exp_type, exp_p1, exp_t, *exp_reason in P:
        ans = answers_from(**kw)
        res = score(c, ans)
        oc = res["outcome"]
        p1 = oc["ranked"][0]["id"] if oc["ranked"] else None
        type_ok = oc["type"] != exp_type[4:] if exp_type.startswith("not:") else oc["type"] == exp_type
        ok = type_ok and (exp_p1 is None or p1 == exp_p1) and (exp_t is None or res["tension"]["id"] == exp_t)
        ok = ok and (not exp_reason or oc.get("reason") == exp_reason[0])
        if not ok:
            failures.append(pid)
        top = ", ".join(f"{r['id']} {r['distance']:.2f}" for r in oc["ranked"][:3])
        print(f"{'OK ' if ok else 'FAIL'} {pid:22s} {oc['type']:16s} {top:60s} tension={res['tension']['id']}")
        vectors.append({"id": pid, "description": desc, "answers": ans, "expected": res})
    a = answers_from(levels={"C1": 2, "C2": -1, "C3": -2, "C4": -2, "C5": -1, "C6": 0})
    b = answers_from(levels={"C1": 2, "C2": 2, "C3": 3, "C4": 2, "C5": 1, "C6": 0})
    cmp = compare(c, a, b)
    print("compare accelerator vs precautionist: biggest gap", cmp["biggest_gap"], "agree", [r["item"] for r in cmp["agree"]], "disagree", [r["item"] for r in cmp["disagree"]])
    # Two people in the same place on every question: no biggest gap.
    same = compare(c, a, a)
    print("compare identical answers: biggest gap", same["biggest_gap"])
    if same["biggest_gap"] is not None:
        failures.append("compare_identical")
    unsettled = next(v for v in vectors if v["id"] == "unsettled_but_strong")["expected"]["outcome"]
    if unsettled.get("unsettled") is not True:
        failures.append("unsettled_but_strong flag")
    cx = [next(v for v in vectors if v["id"] == i) for i in CX_CASES]
    if any(v["expected"] != cx[0]["expected"] for v in cx) or "CX-T1" in cx[-1]["answers"]:
        failures.append("CX-T1 changes the result")
    # Answering CX-T1 doesn't change a friend comparison either.
    with_cx = dict(a, **{"CX-T1": {"choice": 0, "strength": "strongly"}})
    if compare(c, with_cx, b) != cmp:
        failures.append("CX-T1 changes the comparison")
    out = {
        "generated_by": "reference/make_test_vectors.py",
        "note": "Synthetic personas for testing the scoring rules only. Not data about real people.",
        "versions": vectors[0]["expected"]["versions"],
        "score_cases": vectors,
        "compare_cases": [
            {"id": "accelerator_vs_precautionist", "a": a, "b": b, "expected": cmp},
            {"id": "identical_answers", "a": a, "b": a, "expected": same},
        ],
    }
    with open(os.path.join(ROOT, "reference", "test-vectors.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"{len(vectors)} score cases, {len(failures)} failures: {failures}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
