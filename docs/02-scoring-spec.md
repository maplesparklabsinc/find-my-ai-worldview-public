# Scoring specification (deliverable G)

Version 0.4.0, 2026-10-14. Status: editorial v0. Every threshold and prototype here is a design choice made before any data exists. Section 8 says how they get replaced with evidence.

The executable form of this spec is `reference/score.py`. The app's TypeScript scorer must reproduce `reference/test-vectors.json` exactly (score cases and compare cases). If this document and the reference code disagree, the code is wrong or the document is wrong; fix one and regenerate the vectors. Never special-case a vector.

## 1. Inputs

Answers are a map keyed by item ID (see `content/items.json`):

| Format | Value | Notes |
|---|---|---|
| L7 | integer 1 to 7 | 1 Strongly disagree, 4 Neither, 7 Strongly agree, whatever order the options were shown in |
| TO | `{choice: 0 or 1, strength: "slightly" or "strongly"}` | choice 0 is the first option, which is always the construct's high pole |
| SC, CAT | integer option index, 0-based | |
| GRID | `{rowLabel: optionIndex}` | D4 and D5 |
| TXT | string | D9 only; never scored |
| Confidence probe | key `D3:<construct>`, integer option index | one per construct block |

A missing key means the item was skipped. Skipping is always allowed.

## 2. Construct scores

For each scored construct C1 to C6, using only the L7 items assigned to that construct's block in the standard form:

1. Centre each answer: `x = value - 4` (range -3 to +3).
2. Reverse-keyed items (pole `-`): `x = -x`.
3. If at least 3 of the 5 items were answered, the construct score is the mean of the keyed answers, rounded to 4 decimals. Otherwise the construct is **unmeasured** and shows "Not enough answers to place you here".
4. Band: `< -1.5` strong_low, `< -0.5` lean_low, `< 0.5` between, `< 1.5` lean_high, otherwise strong_high.

Trade-off items (C3-T1, C4-T1, C5-T1) and scenarios (S1, S3, S4) are **not** included in construct scores in v0. Mixing formats on one scale is not justified until the pilot shows they load together. Trade-offs feed the tension rules and the base-rate comparisons; scenarios are shown back to the respondent and stored for research.

CX-T1 (rules for low-risk AI) is collected but not scored. It exists to test whether people who hold a case-by-case view are the ones the scorer should place on Pragmatists; scoring will be decided from real answers (tiebreaker or a seventh theme).

Construct scores are displayed as a position between two labelled poles with the band in words. Never display the number, a percentage, or a "score out of 100".

## 3. Outcome

Evaluated in this order; the first rule that fires decides the outcome type.

1. **Undecided (coverage)**: fewer than 4 of the 6 constructs are measured.
2. **Indifferent**: C1 and C2 are both under 0.5 (the "in between" band or lower) and D8 is "Not very important".
3. **Undecided (confidence)**: at least half of the answered D3 probes are "Still forming" or "Not something I have thought about", and the mean absolute construct score is below 0.75. The mean threshold is 1.25 instead of 0.75 when at least four answered probes are "Not something I have thought about". Someone who says they are unsure but answers strongly still gets a perspective, with a note that their views are still forming: when the D3 condition holds but the mean is at or above that threshold, the outcome below (mixed or matched) carries `unsettled: true`, and the result page shows `narratives.unsettled_note`. Otherwise `unsettled` is false.
3b. **Undecided (middle)**: every scored question is in the "between" band (absolute score under 0.5). This applies whether or not the person said their views were still forming. Shown as Still forming with its own wording (narratives.undecided.middle_headline and middle_body).
4. **Distances**: for each perspective in `content/perspectives.json`, compute a weighted, normalized Euclidean distance over measured constructs:

   `d = sqrt( Σ w_c (s_c - μ_c)² / Σ w_c )` for constructs with weight w_c > 0 and a measured score s_c, where μ_c is the perspective's prototype position.

   A perspective is evaluable only if the measured constructs carry at least half of its total weight. Rank evaluable perspectives by distance (ties broken by ID).

   Skeptics (added in taxonomy 0.3.0) is the only perspective with a negative expected-benefit prototype; Precautionists sit slightly positive, since they expect benefits but would delay them.
5. **Mixed, unmatched**: the closest perspective's distance is greater than 1.6.
6. **Mixed, between**: the gap between the second-closest and closest distances, rounded to 4 decimal places, is under 0.2. A gap of exactly 0.2 is a match.
7. **Matched**: otherwise. Show the closest perspective and the next two as "you are also near".

Distances are never shown as numbers or percentages. The results page may show the ranking and may describe relative closeness in words ("closest", "also near").

## 4. Defining tension

Tension rules live in `content/narratives.json` (`tensions`). Each rule has two conditions. A condition is one of:

- construct threshold: score ≥ 1 or ≤ -1; its strength is |score|
- low trust in an actor on D4: "Not much" has strength 1.5, "None" has strength 3
- a trade-off choice: strength 1.5 for "slightly", 3 for "strongly"

A rule fires if all its conditions hold. Its strength is the minimum of its condition strengths. The tension shown is the firing rule with the highest strength, if that strength is at least 1.0; ties go to the rule listed first. If none fires, show the `no_tension` text naming the construct with the largest absolute score.

The tension is the first thing on the results page, above the perspective name (product principle: lead with the person's own trade-off, label second).

## 5. Statements: common ground and differences

An L7 answer gives a signal when it is at least one step from the midpoint: 5 to 7 is "agree", 1 to 3 is "disagree", 4 is no signal. Signals use the raw answer, not the keyed one, because statements are rendered from the item's own wording.

- **Common ground with the closest perspective**: up to 2 of its signature items where the respondent's signal matches the signature direction.
- **Difference from the closest perspective**: up to 1 signature item where the signal is the opposite.
- **Unexpected common ground**: starting from the farthest perspective and moving closer, the first signature item where the respondent matches. Copy: "You and {perspective} are far apart overall, but you agree that {short}."

Statements are rendered with the item's `short` field, using the template for the direction of the answer (`_agree` or `_disagree` in `content/narratives.json`), so a view both sides reject reads as "you don't think…", never as agreement. Never claim agreement the answers do not show.

## 6. Friend comparison

Input: two answer sets. Output (see `compare` in the reference):

- per-construct gap (absolute difference of construct scores), and the construct with the biggest gap; none (null) when every comparable gap is 0, so two people in the same place everywhere aren't told where they're "furthest apart" (`copy.json` `compare.no_difference`)
- up to 3 items where both gave a signal in the same direction, ordered by combined strength (|a-4| + |b-4|)
- up to 3 items where both gave a signal in opposite directions, same ordering

Copy for disagreements is a discussion prompt, not a verdict: "You split on whether {short}. Ask each other: what would change your mind?"

## 7. Versioning

Every stored response and every share link carries `scoring`, `taxonomy`, `item_bank` and `narratives` versions. A result is always reproducible from its answers plus those versions. When any version changes:

- previously shared links keep rendering under the version they were created with, with a banner "Scored under an earlier version. See what changed." linking to the changelog;
- the changelog records what changed, why, the evidence type, and an estimate of how many prior results would get a different label (the FindMyPolitics precedent: about 1 in 5 changed when ideologies were added).

## 8. Known risk and the norming plan

`reference/simulate.py` runs the rules on assumed answer patterns. Under a pattern resembling published Anglosphere base rates (most people lean toward public oversight, human decision-making and shared gains), about 43% of simulated respondents come out **Mixed, between**, Human-Control Defenders take about 19%, and almost nobody is an Accelerator (v0.4 content; unchanged in substance from v0.3). Narrowing the tie margin only moves people from Mixed into Human-Control Defenders.

This is expected. Raw scores bunch near the "protective" pole on C4 to C6 because most people agree with those statements, and the prototypes are placed on the raw scale. The fix is to place people relative to the population, which needs real data:

1. **Soft launch (v0.x)**: ship the raw-scale rules as specified; label results "provisional"; collect research-consented responses and the result feedback (fit rating, better-fitting perspective, "is this about right?" per question, quick check).
2. **Review before norming (v1.0)**: a high share of "in between" results is not by itself a scoring defect. It could reflect real mixed views, overlapping perspectives, weak statements or badly placed prototypes. Once at least 500 research-consented responses exist (or the quota pilot is complete), first check item quality (answer distributions, skips, answer changes), whether the six questions hold up as separate factors, and the result feedback: whether people say their markers are about right, which perspective they say fits better, and how quick-check ratings for their own description compare with a random one. Only then decide whether norming is justified. If it is, standardise each construct against that sample (z-scores), re-place the prototypes in z-space by the same editorial logic, re-run the simulation on the real distribution, and set the tie margin and match distance using the feedback above, not to make results look evenly spread. Publish the norms, the sample they come from and its limits.
3. **Re-label**: re-score stored responses under v1.0; record the share whose label changed in the changelog.

Alternatives considered: within-person (ipsative) emphasis ("which construct stands out most for you") avoids the need for norms but makes scores incomparable between people, which breaks friend comparison; rejected for v0, open for discussion. Calibrating to a single published poll was rejected because no published survey measures these six constructs.

## 9. Tests the implementation must pass

- Every case in `reference/test-vectors.json` (`score_cases` and `compare_cases`): identical outcome type, ranking order, distances to 4 decimals, construct scores and bands, tension ID and statement items.
- Skipping: any subset of items can be skipped without error.
- Determinism: the same answers and versions always give the same result; no randomness in scoring (randomisation applies only to question order).
- Regenerate vectors with `python3 -I reference/make_test_vectors.py` after any content change; the script exits non-zero if a persona no longer lands where its definition says it should.
