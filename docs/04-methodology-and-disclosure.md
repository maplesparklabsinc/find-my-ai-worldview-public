# Site copy: how it works, AI disclosure, privacy, consent, feedback and changelog (deliverable J)

Version 0.4, 2026-10-14. The site copy itself now lives in `content/` (see each section); this document keeps the notes on how it is used. Edit copy there, not here. Voice: talking to a friend or a colleague (see `01-product-spec.md` section 7).

The privacy text is a standard, plain-language draft. It is not legal advice. It is written to match what the product actually does (`01-product-spec.md` section 6). If the data handling changes, this copy must change with it. A lawyer's read is recommended once there is traction.

---

## 1. Before you start (shown on `/start`)

Copy: `content/copy.json` → `start`.

## 2. How this works (`/how-it-works`)

Copy: `content/pages/how-it-works.md`.

## 3. AI disclosure (footer of every page)

Copy: `content/copy.json` → `footer.ai_disclosure`.

## 4. Help shape this (optional, on the results page)

Copy: `content/copy.json` → `research_consent`.

Notes for the build: the checkbox is never pre-ticked; the button is disabled until both the email and the checkbox are filled; store the consent text version with the email.

## 5. Privacy (`/privacy`)

Copy: `content/pages/privacy.md`.

## 6. Quick check (1 in 4 people, before results)

Copy: `content/copy.json` → `quick_check` (the heading, `intro` under it, the question and the note on the results page).

Build notes: a random 25% of people see the check; of those, half see their own closest perspective and half see another one chosen at random. Store which, and the rating. Never shown on compare results, to keep that flow short.

- Shows the perspective's short summary (`card_summary`).
- People in the check skip the guess screen.
- `result_note` (with `which_own` or `which_other`): a small, muted line at the end of the fit questions ("Does this fit you?") on the person's own result, only for people who did the check.

## 7. Tell us (`/feedback`)

Copy: `content/copy.json` → `feedback`.

When opened from a result page, the form offers "Attach my result" (off by default), which adds the response ID.

## 8. What's changed (`/changes`)

Copy: `content/copy.json` → `changelog` (entry labels and entries, newest first).

When writing an entry: "Based on" is one or more of feedback from people who took the quiz ({n}), what the overall answers showed, a source check, or our own review. "Does it change past results?" is one of: No; Yes, about {n}% of earlier results would now show a different perspective; Wording only. The first entry's date is set at launch.

## 9. Sharing, visitors and the middle result (`/r/{id}`)

Copy: `content/copy.json` → `share.note` and `result_page.shared_anonymous`; `content/narratives.json` → the `middle_*` keys under `undecided`.

- `share.note`: first in the "Share your result" section, before the share button, so people know what a shared link shows before they share it.
- `result_page.shared_anonymous`: a plain banner at the very top of a stored result for anyone except the browser that saved it. There are no names (issue #37 follow-up).
- One wording for everyone (issue #37): a visitor reads the result exactly as written for its owner, "you" throughout, and the banner says it was shared with them. Separate visitor headlines and labels (issue #21) were dropped in narratives 0.6.0, because a mix of "you" and "they" confused people.
- `middle_headline`, `middle_body`: the Still forming result when every scored answer is in the middle (`02` rule 3b). It reuses the Still forming lean list and prompts, and has no evidence reference. Its share line is `share.text.undecided_middle` and its share image uses `share.card.title.undecided_middle` and `share.card.subtitle.undecided_middle`.

## 10. Landing perspectives and the guess before the result (issue #24)

Copy: `content/copy.json` → `landing` (`facts`, `steps`, `perspectives_*`, `second_start_button`), `prediction` and `reflection`. The seven cards use each perspective's `name` and `tagline` from `content/perspectives.json`, so they change only with the taxonomy version.

- `prediction`: the screen after the last question (spec 5.4a), for everyone not in the quick check. `picked` is the live hint under the perspective cards ("1 of 2 picked"). A skip is stored as a skip; people in the quick check never see it, and their guess is stored as not shown.
- `reflection`: on the person's own result, right under the result. `same.*` when the outcome is the one they guessed (a pair matches in either order; "still forming" matches a Still forming result unless too many questions were skipped to place them), otherwise `expected.*` followed by `actual.*`. `prompt` follows either. Never on a visitor's view, a comparison, a share image or share text.

## 11. Result page v2 and the share image (issue #28)

Copy: `content/copy.json` → `results.six_intro`, `results.go_deeper`, `fit.quick_note`, `fit.quick_thanks` and `result_page.take_it_body`; `content/perspectives.json` → `card_summary` on each perspective (taxonomy 0.2.1).

- `results.six_intro`: one muted line under the "Your six answers" heading.
- `results.go_deeper`: the heading over the folded rows at the bottom of a result (What stands out, Something to talk about or About each perspective, Common ground, You and others, Help us get this right, Why this result). Every row starts closed.
- `fit.quick_note`: under "Does this fit you?", in its own card after the six answers (owner only). `fit.quick_thanks`: the status line after a rating saves. The rest of the feedback (`fit.section_body`, which fits better, check your six answers, something off) is in the "Help us get this right" row, named by `fit.section_heading`.
- `result_page.take_it_body`: between `take_it_heading` and `take_it_button`, in the card a visitor sees on a result that can only be shown by its headline (an unfrozen release). `{n}` is the standard form's screen count.
- `card_summary`: one line per perspective on the share image only: under the tagline for a closest-perspective result, under each name for In between. Releases before taxonomy 0.2.1 have none; their images show the tagline (closest perspective) or each tagline (In between).

## 12. Fixes from the founder's end-to-end test (issue #37)

Copy: `content/copy.json` → `nav`, `resume`, `landing` (`lede`, `facts`, `steps`), `prediction`, `quick_check.intro` and `result_note`, `results.go_deeper_intro`, `result_page` (`take_it_body`, `compare_*`, `again_*`), `share.note` and `saving.too_quick_compare`; `content/narratives.json` → `provisional`.

- `{n}` in `landing.facts[0]`, `landing.steps[0]`, `result_page.take_it_body` and `result_page.compare_body` is the standard form's screen count, filled the same way as `start.footnote`.
- `nav.back_to_quiz` / `nav.back_to_start`: at the top of Privacy, How this works and What's changed. Back to the quiz (the screen they were on) when a quiz is in progress in the tab, otherwise back to `/`.
- `resume`: on `/` and `/start`, in place of the start buttons, when a quiz is in progress in the tab (the start button would only pick it up again). `start_over` clears the progress and starts fresh.
- `result_page.take_it_heading`, `compare_body` and `compare_button`: the visitor's box on a shared result, directly under the shared-with-you banner and again at the end; `compare_button` is also the sticky bar on phones. All three start the quiz linked to that result.
- `result_page.again_link`: at the end of your own result. `again_unsaved`, `again_confirm` and `again_keep` are the in-page confirmation when the result isn't saved.
- `results.go_deeper_intro`: one muted line under the "Go deeper" heading.
- `saving.too_quick_compare`: after `saving.too_quick`, only for someone who came from a shared result or compare link, with a "Start again" button that keeps the link. A comparison needs a saved result.
- `provisional`: the early-version note, now at the end of the "Why did I get this?" / "Why this result?" fold, as its own paragraph after the How this works link, on every outcome.
- `result_page.old_version` / `missing_version`: at the very end of the page, above the footer, for the owner and visitors alike.
