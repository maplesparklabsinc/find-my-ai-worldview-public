# Product specification (deliverable I)

Version 0.1, 2026-10-12. Written from the founder's product vision. Read with `CLAUDE.md` (non-negotiables), `02-scoring-spec.md` (scoring) and `04-methodology-and-disclosure.md` (site copy, consent and privacy).

## 1. The product in one paragraph

A simple, friendly website where anyone can answer about 50 quick questions about AI, get a result that means something to them, and share it. Friends who open a shared link can take it too and see how they compare. Nobody needs an account or an email to get results. Every completed quiz is logged anonymously so we can count completions and see overall results. People who want to help further can leave an email for future contact. Nothing fancy, by design.

## 2. Principles

1. **Fast to start.** One tap from the landing page to the first question. No sign-up, no email, no demographics up front.
2. **Easy to read.** Talk like a friend or a colleague, not a researcher. Short sentences, everyday words.
3. **A result worth sharing.** A clear headline (your closest perspective), what stands out about your views, and something to talk about.
4. **Honest.** No fake precision, no "you are 87% Steward". Results are described as closest matches, and "still forming", "in between" and "not a priority" are real results.
5. **Private by default.** No names, no emails unless someone chooses to leave one, no IP addresses stored, no advertising trackers.
6. **Simple to build and run.** One Next.js app, one Supabase project for development and one for production, deployed on Vercel.

## 3. Platform

| Decision | Choice | Why |
|---|---|---|
| URL | `findmyaiworldview.maplesparklabs.com`; move to `findmyaiworldview.com` if it gets traction (keep the subdomain redirecting so shared links never break) | No new domain until there is traction |
| App | Next.js (App Router), TypeScript, Tailwind | Founder's stack |
| Hosting | Vercel; subdomain pointed with a CNAME | Simple deploys, preview links for each pull request |
| Database | Supabase (Postgres), Canada region (ca-central-1), accessed as plain Postgres | Founder has used it; Canadian data residency; easy SQL views for totals; no lock-in |
| Analytics | Vercel Web Analytics and Speed Insights (cookieless) | Page views, funnel events and page load timings without cookies or personal data |
| Email | None sent in v1 | Research emails are only collected; contact happens manually later |

The database is only read and written from server routes, through a Postgres connection string (`DATABASE_URL`, kept in Vercel settings) and a small SQL query library, not the Supabase JavaScript client. Moving to another Postgres host (Neon, AWS) should be a settings change. Row-level security is on for every table with no public policies, so even a leaked public key could not read or write anything. The schema lives in SQL migration files in the repo, applied to both projects. Development and production use separate databases; production only ever holds real responses, and its data is stored in Canada. How each is hosted and run is in the private operations notes.

## 4. User flow

```
Landing ──► Before you start ──► Questions (6 short sections) ──► A few about you ──► Quick check (1 in 4 people) or Your guess (optional, everyone else) ──► Results
                                                                                                                                       │
                                                             ┌─────────────────────────────────────────────────────────────────────────┤
                                                             ▼                          ▼                                              ▼
                                                     Share your result      Leave an email (optional)                   Tell us if something's off
```

A friend who opens a **shared result link** sees that result with an invitation to take the quiz and compare (issue #37). The quiz they take is linked to the shared result, so their result opens with a side-by-side comparison, plus their own full result. Older **compare links** (`/c/{id}`, before issue #37) still work the same way. No first names are collected or shown.

A quiz in progress is kept in the tab (5.3). The landing page and Before you start then offer "Pick up where you left off" or "Start over", and Privacy, How this works and What's changed link back to the quiz instead of to the start.

## 5. Screens

### 5.1 Landing (`/`)

- Headline and one line on what this is: where you land, the perspective your answers are closest to, and comparing with friends.
- The commitment, before anyone starts: "{n} quick questions · Around 10 minutes · No sign-up · No right answers", with {n} the standard form's screen count, the same number Before you start shows
- Primary button: Start
- Small links: How this works, Privacy
- A compact three-step explanation (answer, see where you land, compare) beside the hero on wide screens, below it on phones.
- **Seven perspectives on AI** (issue #24): a short intro, then one card per perspective with its name and tagline from `content/perspectives.json`, in the listed order. Every card has the same size, weight and depth of copy; none is colour-coded or set apart (Pragmatists is not presented as the default or the neutral choice). Under the cards, a note that the perspectives are conversation starters and that a result may be between two, your own combination, still forming or "AI isn't high on your list". A second start button follows, so nobody has to scroll back up. One card per row on narrow phones.
- If opened from a compare link: "{Name} took this and wants to compare. Take it to see where you agree and where you don't." (or "Someone shared this with you…" with no name)
- Optional, once there are enough completions: "{N} people have taken this so far" (show only after 500)

### 5.2 Before you start (`/start`)

One screen, readable in 20 seconds:

- What we mean by AI (the definition text from `content/items.json`, in a lighter voice where possible without changing meaning)
- "There are no right answers. If you're not sure, go with how you lean. You can skip anything."
- Privacy line: "We save an anonymous copy of your answers so we can count results. No name, no email, nothing that identifies you. [Privacy]"
- Button: Let's go

### 5.3 Questions (`/quiz`)

- One question per screen on phones; the same layout centred on larger screens.
- Agree/disagree questions show the statement and seven options as a vertical list of full-width tappable rows, labelled in words (Strongly disagree … Strongly agree). The middle option reads "Neither agree nor disagree". No numbers shown. The same vertical layout on every screen size (never switch to a horizontal scale on desktop).
- The statement and all seven options fit on one phone screen without scrolling (test at 390×660, the visible area of a phone browser with its toolbars showing, using the longest statement, C5-05). Rows are 48 px tall with 6 px gaps; "Skip" sits in the header.
- Answer direction is counterbalanced: each person is randomly assigned, from their stored seed, to see either "Strongly disagree" or "Strongly agree" first, and keeps that direction for every agree/disagree question. The same assignment flips the left/right order of the two trade-off cards. Answers are always stored in canonical order (1 = Strongly disagree; trade-off option index as in `content/items.json`), and the direction is stored with the response.
- Tapping an answer shows the selected state, then moves to the next question after about 400 ms, with a visible Back control. Answers can be changed by going back. Trade-off questions need two taps, so they use a Next button instead.
- "Skip" is always available and visually quiet (in the header on question screens).
- Progress: "Question 12 of 50" above a thin bar that fills at a constant rate, one step per screen. No part labels: section order is shuffled per person, and sections are never named after the constructs (naming them could steer answers).
- A "Larger text" control (an "Aa" button in the quiz header) bumps statement and option sizes by about 20% and is remembered for the session.
- Mobile first: one column, answer rows at least 48 px tall, every other control at least 48 px, at least 8 px between tap targets. On wide screens the quiz and results stay a single centred column no wider than 640 px; only the landing page uses two columns.
- End of each section: the "How settled are your views on these?" question (D3).
- Trade-off questions: two statements as two large cards; after picking one, "How strongly?" Slightly / Strongly.
- Scenario questions: a small "A situation" label, the situation, and four full-width option rows (labels may wrap to two lines). Same selection and auto-advance as agree/disagree.
- End of each section: before the D3 question, a short line: "That's one part done. One quick question about it before the next."
- Order: follow `content/items.json` → `forms.S`: section order and item order inside each section are shuffled per person using a stored seed; then S1 (the cancer-research scenario) first after the six sections, followed by the trade-offs (their order shuffled per person from the same seed, `after_blocks_shuffled`) and other scenarios; then "A few about you".
- Answers are kept in the browser (session storage) until the end, so a refresh does not lose progress.

### 5.4 A few about you

D11 country, D1 how often you use AI, D2 how well you understand it, D4 trust grid, D6 lived benefit, D7 lived harm, D8 importance, D9 "In a few words, how would you describe your view of AI?" (optional, free text). Introduced with: "Last few. These don't change your result; they help us understand everyone's answers." Asked at the end so the quiz starts with the interesting part. The intro sits in a tinted box above the first of these questions.

- D4 trust grid: never a table on phones. One screen, one row at a time: the row name as the heading, styled like a question, with the shared question smaller and muted above it, and "2 of 4" beside the row name; the four options as rows, auto-advance to the next unanswered row after about 400 ms. Answered rows are listed underneath with their answer and "Change". It counts as one question in the progress count.
- D9 free text: optional, 280 characters at most, with the hint "Optional. Please leave out names and contact details." The button reads "See my result". Free text is never shown on any result page, view or export summary; it is read in the database and on the private `/admin` response page, with any email address masked (issue #51).

### 5.4a Your guess (optional, issue #24)

After the last answer and before anything is saved or shown, for everyone not in the quick check (5.5): "Before you see your result, where do you think your answers landed?" The seven perspective cards can be tapped, up to two (one is a guess at that perspective, two at being between them; a third tap replaces the older pick), with a live "1 of 2 picked" hint. Below them, "My own combination", "My views are still forming" and "AI isn't high on my list" are single options: picking one clears the cards, and tapping a card clears it. Plus "No guess, skip this". Focus moves to the heading when it opens. On a phone the buttons stay in a footer fixed to the bottom of the screen. People in the quick check never see this screen (issue #37), so the description they rate can't steer a guess and nobody gets two screens before their result; their guess is stored as not shown, not as skipped.

The guess never reaches the scorer. It is checked on the server against the current perspectives and stored with the anonymous response (6.1). On the result, the person who made the guess sees it beside the outcome before the share controls ("You expected Accelerators. Your answers landed closest to Stewards." then "What feels right about that? What surprised you?"), never described as right, wrong or accurate. It is kept only in that browser for this, and never appears on the public result, a comparison, a share image or share text.

### 5.5 Quick check (1 in 4 people)

Before the result, a random 25% of people see one perspective's short summary (`card_summary`) without its name, under "Does this sound like you? It helps us check our descriptions, and it won't change your result.", and rate how well it describes them (5 options). Half of those see their own closest perspective; half see a different one at random. They skip the guess (5.4a). On the result, a small muted line at the end of the fit questions says which description it was and why. Stored with the response. See `04-methodology-and-disclosure.md` section 6.

### 5.6 Results (`/r/{id}`)

One scrolling page, laid out as the "Result page v2" boards on the screens canvas (issue #28), reordered in issue #37. Order:

1. **Banners**: shared-with-you (visitors), then for visitors the "Where would you land?" box (5.8); the friend comparison when there is one.
2. **Hero card** (the shareable part): "Your closest perspective" + perspective name, tagline, description, then "The strongest objection to this view" and the objection. Under it, "Closest of the seven…, also near…". Visitors see the same wording as the owner, under the shared-with-you banner. For other outcomes, use the outcome copy in `content/narratives.json` ("You sit between Stewards and Pragmatists", "Your own combination", "Your views are still forming", "AI isn't high on your list").
3. The owner's guess (5.4a) and, on a compare result, "Send this to {name}".
4. **Your six answers**: one card, a row per construct: the question, a track between two short labelled ends (`share.card.ends`) with a centre mark and a single marker, and the band in words underneath ("Leaning toward public, independent oversight"). Text equivalent for screen readers. Unmeasured constructs say so.
5. **Does this fit you?** (owner): five options in one tap, saved anonymously with the response (see 6.1). This is how we learn whether the results describe people well enough to refine the scoring. After a quick check (5.5), a small muted line at its end says which description was rated.
6. **Share your result** (owner, 5.7), after the fit questions, so people share once they've seen and judged their result.
7. **Help shape this (optional)** (owner): email field and consent checkbox (copy in `04-methodology-and-disclosure.md`). Never pre-ticked. A clear confirmation after submitting.
8. **Go deeper**, with a one-line intro: folded rows, all closed on load:
   - **What stands out**: the defining tension sentence (or the `no_tension` sentence).
   - **Something to talk about**: the perspective's discussion prompt.
   - **Common ground**: "Like most {perspective}, you agree that…", "You and {far perspective} are far apart overall, but you agree that…", "Unlike most {perspective}, you don't agree that…".
   - **You and others**: two or three base-rate figures for the person's country from `content/base-rates.json`, each with source, year and population in small type.
   - **Help us get this right** (owner): **Which fits you better?** after Not at all, A little or Somewhat (the other six perspectives, name and tagline, plus "None of these" and "My own mix"); **Check your six answers** (collapsed): under each track, "Is this about right?" with "About right", "I'm further toward {low}", "I'm further toward {high}"; "Something off? Tell us" links to the feedback form with the result ID attached (only if they choose).
   - **Why did I get this?**: the plain-language explanation from `narratives.json`, a link to How this works, and the early-version note.
9. **Take the quiz again** (owner): a link. A saved result keeps its link, so it just clears any progress and goes to Before you start; an unsaved one asks first, on the page. Visitors get the "Where would you land?" box again instead.
10. The earlier-version note, when the result was scored under an earlier version.
11. Footer: How this works · Privacy · What's changed · Built with help from AI.

Visitors see only the result, the six answers and Go deeper (no fit questions, research sign-up, share box or feedback prompts), plus the invitation to compare (5.8).

Other outcomes replace the hero with their own, followed by their own section (below), then continue from item 3 as normal. In between has an "About {perspective}" row for each of its two perspectives (description, objection, discussion prompt) in place of "Something to talk about". Copy is in `content/narratives.json` → `outcomes`:

- **In between:** headline and body; one card per perspective (name, tagline, one thing you share with it); "The question that might tip you".
- **Your own combination:** headline and body; "What's distinctive" (the tension sentence, or the `no_tension` sentence); the two nearest perspectives as chips under "Nearest of the seven, though not close:"; "Think we're missing a perspective? Tell us" (feedback form).
- **Still forming:** headline and body with its source line; "Where you lean so far" (the band for every construct not "In between", or `lean_none`); "Three questions worth thinking about": the discussion prompts of the three nearest perspectives, nearest first. The coverage version (too many skips) uses `coverage_body` instead.
- **Not a priority:** headline and body with its source line; the `section_heading` and `section_body`.

Reference screens for all of these are in `design/screens/` (`ResultBetween`, `ResultOwn`, `ResultForming`, `ResultNotPriority`).

Dark mode follows the device setting, using the dark values in `design/tokens.json` (see `DarkQuestion` and `DarkResultBetween`). No manual toggle in v1.

The results URL is the person's own page. Anyone with the link sees the same result (no email, no name on it). A banner appears if the result was scored under an earlier version.

### 5.7 Sharing

- One button (issue #37): **Share**, which opens the device's own share menu (`navigator.share`, mostly phones) with the title, the share text and the result link, but no image file, since several apps drop the link when a file is attached; or, where there is no share menu, **Copy link**, which copies the link and says "Link copied" for 3 seconds.
- Under it, a thumbnail of the share image with "Download image" (the thumbnail downloads it too).
- The shared link is the read-only view, `/r/{id}?view=shared`: it always shows the visitor view (5.8), even in the browser that saved the result, so the sharer sees exactly what friends will. `/r/{id}` itself stays the owner's page in their browser.
- Share text: "I got {perspective} on Find My AI Worldview. What do you think about AI? {link}" (outcome-specific variants for in between / still forming / not a priority).
- Link preview image (Open Graph `og:image`, 1200×630, with the page title and description), so the shared link shows the card in messaging and social apps once the site is public (not behind `SITE_PASSWORD`): perspective name, tagline and one-line summary (`card_summary`; for In between, both names with their summaries), the six questions as tracks drawn like the result page, and the product name with the site address. Generated on the server from the stored result.
- A downloadable square image (1080×1080) for Instagram-style sharing: same content.
- Nothing about the person beyond their result appears on any share asset.

### 5.8 Compare with a friend

- Comparing happens from the shared result link (issue #37). For anyone but the owner, `/r/{id}` invites them to take the quiz and compare: a "Where would you land?" box right under the shared-with-you banner, visible without scrolling on a phone; a slim bar fixed to the bottom of the screen on phones while neither box is on screen; and the same box at the end. All three start the quiz linked to that result. The friend still sees it in full, since a shared image alone can't be clicked.
- Compare links made before issue #37 (`/c/{id}`, same response ID, different route) keep working. No first names: the friend's view says "Someone shared this with you", and the comparison says "your friend".
- If the friend finishes too quickly for the answers to be saved, the comparison can't be shown either; the page says so and offers to start again, still linked.
- The friend takes the full quiz. Their result page opens with a **comparison section** first: both closest perspectives, six tracks with two markers (you / them, distinguished by shape and label, not only colour), "You both agree that…" (up to 3), "You split on…" with a discussion prompt for each (up to 3), and the construct with the biggest gap. Then their full individual result as in 5.6.
- The original sharer can see the comparison too: the friend's result page has "Send your comparison back" which shares `/r/{friendId}?vs={originalId}`.
- Comparison logic: `compare()` in `reference/score.py`.

### 5.9 Other pages

- **How this works** (`/how-it-works`): friendly version of the methodology (copy in `04`), including the AI-use disclosure.
- **Privacy** (`/privacy`): copy in `04`.
- **What's changed** (`/changes`): the changelog, newest first.
- **Tell us** (`/feedback`): the feedback form (copy in `04`, section 7).

## 6. Data

### 6.1 What is stored

| Table | Contents | Personal information? |
|---|---|---|
| `responses` | random ID (12+ characters, unguessable), completion date (date only, no time), all version strings, form, shuffle seed, answer direction (disagree-first or agree-first), answers, time spent per question (ms), the computed result (outcome, perspective ranking, construct scores, tension ID), quick-check data, the optional guess made before the result (kind, and the perspective or pair guessed), result feedback (fit rating, the better-fitting perspective if chosen, the six "is this about right?" answers), how many times each answer was changed with Back | No. No IP address, no user agent, no email, no cookies, no name. |
| `research_contacts` | email, the response ID it belongs to, consent text version, date, `withdrawn` flag | Yes (email). Separate table, never exposed to the browser, never shown on any page. |
| `feedback` | type, item or perspective IDs, versions, text, optional email, permission to quote, optional response ID, date | Only if they leave an email |

Results are always computed in the browser with the shared scoring module and re-checked on the server before saving (same module), so a tampered request cannot store an impossible result.

### 6.2 Writes

- `POST /api/responses` on completion: validates the payload against the item bank (known IDs, valid values), recomputes the result, stores it, returns the ID. Basic abuse controls: payload size limit, rejects completions faster than 60 seconds total, simple per-IP rate limit held in memory or at the edge (IP used only for the limit, never stored).
- `PATCH /api/responses/{id}` for the result feedback (only within 24 hours of creation).
- `POST /api/research-contact` with email + response ID + consent version.
- `POST /api/feedback`.

### 6.3 Seeing totals

SQL views in Supabase (the founder can read them in the Supabase dashboard from day one). The read-only `/admin` page shows the same aggregates, behind its own password (`ADMIN_PASSWORD`, in its own Basic-auth realm, and closed with a 404 if it is the same as `SITE_PASSWORD`); `/admin/responses` lists single responses (versions, result with ranked distances, every answer with the label seen, skips, research opt-in, everything the person told us around their result including the free-text answer and attached feedback, answer direction and seed). Email addresses never appear there: email columns are never read, and any address typed into free text or feedback is masked. The rest of the site needs no password:

- `v_totals`: completions all time, last 7 days, today
- `v_daily`: completions per day
- `v_outcomes`: count and share by outcome type and closest perspective
- `v_constructs`: mean and spread of each construct score, overall and by country
- `v_items`: answer distribution for every question
- `v_skips`: skip rate per question
- `v_fit`: average "does this fit" rating by outcome and perspective, and quick-check own vs random ratings
- `v_better_fit`: assigned perspective against the perspective people said fits better (a confusion table), including "None of these" and "My own mix"
- `v_track_checks`: for each of the six questions and each band, the share answering "about right", "further toward low" and "further toward high"
- `v_answer_changes`: how often each question's answer was changed with Back (a sign of a confusing statement)
- `v_predictions`: the guess made before the result against the outcome (kind, perspectives, outcome, closest and second perspective), from the responses that were asked. Not evidence that the perspectives are valid, and not published until there is enough clean data
- `v_research_contacts`: count only (emails are never in a view)

These are the data for the norming step in `02-scoring-spec.md` section 8. Totals are self-selected people who chose to take the quiz; any public display of them must say so.

### 6.4 Funnel events (Vercel Web Analytics, no personal data)

`landing_perspectives_viewed`, `landing_start_selected` (hero or perspectives), `quiz_started`, `section_completed` (1 to 6), `prediction_shown`, `prediction_submitted` (kind only, never which perspectives), `prediction_skipped`, `quiz_completed`, `result_revealed`, `result_shared` (channel), `result_section_opened` (which Go deeper row: `stands_out`, `talk`, `about_p1`, `about_p2`, `common_ground`, `others`, `help` or `why`; once per row per page view), `compare_link_created`, `compare_started`, `compare_completed`, `research_email_left`, `feedback_sent`.

Watch, after the landing page shows the seven perspectives: start rate from each button, completion, how many people guess, how guesses line up with results, and any shift in answer or result distributions (`v_items`, `v_outcomes`). A clear shift may mean the preview is priming answers.

## 7. Voice

Write like you're explaining it to a friend over coffee. Plain words, short sentences, "you" and "we". Warm, curious, never preachy.

| Instead of | Write |
|---|---|
| "This instrument measures your normative orientations toward AI governance." | "This helps you figure out what you actually think about AI." |
| "Respondents are classified into the nearest perspective." | "We show you the perspective your answers are closest to." |
| "Insufficient data to compute this dimension." | "You skipped a few here, so we can't place you on this one." |
| "Your profile exhibits internal tension." | "Here's what stands out about your views." |

Rules: no jargon (no "construct", "dimension", "psychometric", "validated", "latent"); no hype or doom words; no exclamation marks in results; never tell people they are right or wrong. Survey statements keep their exact wording (changing words changes what a question measures); everything around them follows this voice.

## 8. Accessibility and quality bar

- WCAG 2.2 AA; full keyboard use; visible focus; screen-reader labels on every answer option; every visual track has a text equivalent.
- Works well on a five-year-old phone: first page interactive in under 2 seconds on a mid-range phone over 4G; total JavaScript kept small.
- Respects reduced motion and dark mode.
- No colour carries meaning on its own; no red/blue for any pole.

## 9. Milestones

| Milestone | Scope | Done when |
|---|---|---|
| M1 Foundations | Content loaders, scoring module passing all test vectors, form sequencing, compare logic | Unit tests green on `reference/test-vectors.json` |
| M2 Usable quiz | Landing, before-you-start, questions, a-few-about-you, results page (all client-side), design system applied; run locally, not deployed: phones on the same Wi-Fi open it from the founder's computer (`npm run dev:lan`), and testers elsewhere use a temporary tunnel behind `SITE_PASSWORD` (`npm run share`) | Five non-technical people complete it on their phones and understand their result (lightweight version of the interview guide) |
| M3 Launch | Supabase logging, result pages by ID, share images, compare flow, research email, result feedback and the quick check (so data for refining the scoring is collected from day one), feedback form, How this works, Privacy, What's changed, analytics events; developed and tested on localhost against the dev database until ready; at launch, pushed to Vercel on the subdomain and connected to the production Supabase project, with the quiz open to everyone and only `/admin` password-protected (`ADMIN_PASSWORD`) | Launch checklist (section 10) complete |
| M4 After launch | Optional "go deeper" questions (research form items), "people who took this" stats, norming at 500 completions | As each ships |

## 10. Launch checklist

Kept with the private operations notes, since it names security settings and plans.

## 11. Not in v1

Accounts, saved history, groups or rooms, other languages, emailing anyone, public leaderboards, paid features, any use of results to make decisions about people.
