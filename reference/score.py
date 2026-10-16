#!/usr/bin/env python3
"""Reference implementation of the Find My AI Worldview scoring rules (docs/02-scoring-spec.md).

This is the specification in executable form. The app's TypeScript scorer must
produce the same outputs for every case in reference/test-vectors.json.

Answer format (a dict keyed by item ID):
  L7 items       int 1..7
  TO items       {"choice": 0|1, "strength": "slightly"|"strongly"}   choice 0 = first option (high pole)
  SC / CAT       int option index (0-based)
  GRID items     {"<row label>": int option index}
  TXT            str
  confidence     "D3:<construct>" -> int option index, one per block
Missing keys mean skipped.
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(name):
    with open(os.path.join(ROOT, "content", name), encoding="utf-8") as f:
        return json.load(f)


class Content:
    def __init__(self):
        self.items_bundle = load("items.json")
        self.items = {i["id"]: i for i in self.items_bundle["items"]}
        self.config = load("scoring-config.json")
        self.persp = load("perspectives.json")
        self.narr = load("narratives.json")
        self.base = load("base-rates.json")


def band(score, bands):
    for b in bands:
        if b["max_exclusive"] is None or score < b["max_exclusive"]:
            return b["id"]


def keyed(item, raw, center):
    x = raw - center
    return -x if item["pole"] == "-" else x


def construct_scores(c, answers):
    cfg = c.config
    out = {}
    form = c.items_bundle["forms"][cfg["form"]]
    for block in form["blocks"]:
        k = block["construct"]
        vals = [keyed(c.items[i], answers[i], cfg["likert"]["center"]) for i in block["items"] if isinstance(answers.get(i), int)]
        expected = len(block["items"])
        if len(vals) >= cfg["min_items_per_construct"]:
            s = round(sum(vals) / len(vals), 4)
            out[k] = {"score": s, "band": band(s, cfg["bands"]), "answered": len(vals), "expected": expected}
        else:
            out[k] = {"score": None, "band": None, "answered": len(vals), "expected": expected}
    return out


def distances(c, scores):
    mcfg = c.config["match"]
    res = []
    for p in c.persp["perspectives"]:
        w_all = sum(p["weight"].values())
        num = den = 0.0
        for k, w in p["weight"].items():
            s = scores[k]["score"]
            if w <= 0 or s is None:
                continue
            num += w * (s - p["prototype"][k]) ** 2
            den += w
        if den < mcfg["min_weight_share_evaluable"] * w_all:
            continue
        res.append({"id": p["id"], "name": p["name"], "distance": round(math.sqrt(num / den), 4)})
    res.sort(key=lambda r: (r["distance"], r["id"]))
    return res


def outcome(c, scores, answers):
    cfg = c.config
    scored = {k: v["score"] for k, v in scores.items() if v["score"] is not None}
    ranked = distances(c, scores) if scored else []
    if len(scored) < cfg["min_scored_constructs"]:
        return {"type": "undecided", "reason": "coverage", "ranked": ranked}

    ind = cfg["indifferent"]
    sal = answers.get(ind["salience_item"])
    # Strictly below, so expected benefit and harm in the "between" band count (scoring 0.4.0).
    if (scored.get("C1") is not None and scored.get("C2") is not None and scored["C1"] < ind["below_C1"]
            and scored["C2"] < ind["below_C2"] and sal in ind["low_salience_options"]):
        return {"type": "indifferent", "ranked": ranked}

    und = cfg["undecided"]
    probes = [answers.get(f"{und['confidence_item']}:{k}") for k in cfg["scored_constructs"]]
    probes = [p for p in probes if isinstance(p, int)]
    unsettled = sum(1 for p in probes if p in und["unsettled_options"])
    mean_abs = sum(abs(v) for v in scored.values()) / len(scored)
    is_unsettled = bool(probes) and unsettled / len(probes) >= und["min_unsettled_share"]
    # People who haven't thought about most themes often agree a little with everything,
    # so a higher bar applies before they get a perspective (scoring 0.4.0).
    unconsidered = sum(1 for p in probes if p == und["unconsidered_option"])
    threshold = und["max_mean_abs_score_unconsidered"] if unconsidered >= und["min_unconsidered_probes"] else und["max_mean_abs_score"]
    if is_unsettled and mean_abs < threshold:
        return {"type": "undecided", "reason": "confidence", "ranked": ranked}

    # Every scored question sits in the "between" band (|score| < 0.5), whether or
    # not the person said they were unsure: no perspective fits better than another.
    if all(abs(v) < und["middle_max_abs_score"] for v in scored.values()):
        return {"type": "undecided", "reason": "middle", "ranked": ranked}

    # Unsettled but answering strongly: still gets a result below, flagged so the
    # page can add a note that their views are still forming (docs/02 section 3).
    m = cfg["match"]
    if not ranked or ranked[0]["distance"] > m["max_distance_for_match"]:
        return {"type": "mixed_unmatched", "ranked": ranked, "unsettled": is_unsettled}
    # The gap is rounded first, so a gap of exactly 0.2 is a match despite floating-point noise.
    if len(ranked) > 1 and round(ranked[1]["distance"] - ranked[0]["distance"], 4) < m["tie_margin"]:
        return {"type": "mixed_between", "ranked": ranked, "unsettled": is_unsettled}
    return {"type": "matched", "ranked": ranked, "unsettled": is_unsettled}


def tension(c, scores, answers):
    cfg = c.config
    trust_rows = c.items["D4"]["rows"]
    best = None
    for t in c.narr["tensions"]:
        strengths = []
        for cond in t["when"]:
            if "construct" in cond:
                s = scores[cond["construct"]]["score"]
                if s is None:
                    break
                ok = s >= cond["value"] if cond["op"] == ">=" else s <= cond["value"]
                if not ok:
                    break
                strengths.append(abs(s))
            elif "trust_low" in cond:
                v = (answers.get("D4") or {}).get(cond["trust_low"])
                st = cfg["trust_strength"].get(str(v), 0) if isinstance(v, int) else 0
                if st <= 0:
                    break
                strengths.append(st)
            elif "tradeoff" in cond:
                a = answers.get(cond["tradeoff"])
                if not isinstance(a, dict) or a.get("choice") != cond["option"]:
                    break
                strengths.append(3.0 if a.get("strength") == "strongly" else 1.5)
        else:
            st = min(strengths)
            if st >= cfg["tension"]["min_strength"] and (best is None or st > best["strength"]):
                best = {"id": t["id"], "text": t["text"], "strength": round(st, 4)}
    if best:
        return best
    scored = {k: v["score"] for k, v in scores.items() if v["score"] is not None}
    if not scored:
        return None
    k = max(scored, key=lambda x: (abs(scored[x]), x))
    name = c.narr["constructs"][k]["name"]
    return {"id": "none", "text": c.narr["no_tension"].replace("{strongest_construct_name}", name), "strength": 0.0, "strongest_construct": k}


def signal(c, item_id, answers):
    """Raw agreement direction for an L7 item: 'agree', 'disagree' or None (weak/missing)."""
    v = answers.get(item_id)
    if not isinstance(v, int):
        return None
    x = v - c.config["likert"]["center"]
    t = c.config["statements"]["min_abs_raw_for_signal"]
    return "agree" if x >= t else "disagree" if x <= -t else None


def statements(c, oc, answers):
    persp = {p["id"]: p for p in c.persp["perspectives"]}
    ranked = oc["ranked"]
    out = {"common_ground": [], "differences": [], "unexpected": None}
    if not ranked:
        return out
    closest = persp[ranked[0]["id"]]
    for s in closest["signatures"]:
        d = signal(c, s["item"], answers)
        if d == s["direction"]:
            out["common_ground"].append({"perspective": closest["id"], "item": s["item"], "direction": d})
        elif d is not None:
            out["differences"].append({"perspective": closest["id"], "item": s["item"], "direction": d})
    out["common_ground"] = out["common_ground"][:2]
    out["differences"] = out["differences"][:1]
    for r in reversed(ranked[1:]):  # farthest first
        p = persp[r["id"]]
        for s in p["signatures"]:
            if signal(c, s["item"], answers) == s["direction"]:
                out["unexpected"] = {"perspective": p["id"], "item": s["item"], "direction": s["direction"]}
                break
        if out["unexpected"]:
            break
    return out


def score(c, answers):
    scores = construct_scores(c, answers)
    oc = outcome(c, scores, answers)
    return {
        "versions": {
            "scoring": c.config["scoring_version"],
            "taxonomy": c.persp["taxonomy_version"],
            "item_bank": c.items_bundle["item_bank_version"],
            "narratives": c.narr["narratives_version"],
        },
        "constructs": scores,
        "outcome": oc,
        "tension": tension(c, scores, answers),
        "statements": statements(c, oc, answers),
    }


def compare(c, a, b):
    """Friend comparison: per-construct gap, agreements and disagreements on standard-form L7 items."""
    sa, sb = construct_scores(c, a), construct_scores(c, b)
    gaps = {k: (round(abs(sa[k]["score"] - sb[k]["score"]), 4) if sa[k]["score"] is not None and sb[k]["score"] is not None else None) for k in sa}
    agree, disagree = [], []
    for i in c.items.values():
        if i["format"] != "L7" or "S" not in i["forms"]:
            continue
        da, db = signal(c, i["id"], a), signal(c, i["id"], b)
        if da and db:
            strength = abs(a[i["id"]] - 4) + abs(b[i["id"]] - 4)
            (agree if da == db else disagree).append({"item": i["id"], "a": da, "b": db, "strength": strength})
    agree.sort(key=lambda r: (-r["strength"], r["item"]))
    disagree.sort(key=lambda r: (-r["strength"], r["item"]))
    biggest = max((k for k in gaps if gaps[k] is not None), key=lambda k: (gaps[k], k), default=None)
    # No gap anywhere: there is no "furthest apart" to point to.
    if biggest is not None and gaps[biggest] == 0:
        biggest = None
    return {"gaps": gaps, "biggest_gap": biggest, "agree": agree[:3], "disagree": disagree[:3]}


if __name__ == "__main__":
    import sys
    c = Content()
    print(json.dumps(score(c, json.load(open(sys.argv[1]))), indent=1))
