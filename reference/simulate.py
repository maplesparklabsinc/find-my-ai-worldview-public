#!/usr/bin/env python3
"""Stress-test the matching rules with simulated answer patterns.

The patterns are assumptions, not data. Use this to catch degenerate rules
(one perspective swallowing everyone, too many Mixed results) before real
data exists, and to compare rule changes. Replace the assumed patterns with
pilot-derived means and SDs once the pilot is in.

Usage (repo root): python3 -I reference/simulate.py [n]
"""
import collections, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score import Content, score  # noqa: E402
from make_test_vectors import answers_from, FORM  # noqa: E402

PATTERNS = {
    "spread (all means 0, sd 1.5)": ({k: 0 for k in ["C1", "C2", "C3", "C4", "C5", "C6"]}, 1.5),
    "anglosphere guess (protective poles high, sd 1.0)": ({"C1": .3, "C2": 1, "C3": 1, "C4": 1.2, "C5": 1.5, "C6": 1.5}, 1.0),
}
# Centred on a perspective's prototype in content/perspectives.json, so they follow
# it when it moves: is the perspective reachable, and do its neighbours take its people?
CENTRED = [("skeptic", "skeptics"), ("precautionist", "precautionists"), ("human control", "human_control")]
ITEMS = [i for b in FORM["blocks"] for i in b["items"]]


def run(c, means, sd, n, seed=7):
    rnd = random.Random(seed)
    cnt = collections.Counter()
    for _ in range(n):
        lv = {k: max(-3, min(3, rnd.gauss(m, sd))) for k, m in means.items()}
        jit = {i: rnd.choice([-1, 0, 0, 1]) for i in ITEMS}
        conf = rnd.choices([0, 1, 2, 3], [25, 40, 25, 10])[0]
        sal = rnd.choices([0, 1, 2, 3], [20, 35, 30, 15])[0]
        oc = score(c, answers_from(lv, jitter=jit, confidence=conf, salience=sal))["outcome"]
        cnt[oc["type"] if oc["type"] != "matched" else oc["ranked"][0]["id"]] += 1
    return {k: round(100 * v / n) for k, v in cnt.most_common()}


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    c = Content()
    proto = {p["id"]: p["prototype"] for p in c.persp["perspectives"]}
    for name, pid in CENTRED:
        PATTERNS[f"{name} (centred on {pid}, sd 1.0)"] = (proto[pid], 1.0)
    for name, (means, sd) in PATTERNS.items():
        print(f"{name}: {run(c, means, sd, n)}")
