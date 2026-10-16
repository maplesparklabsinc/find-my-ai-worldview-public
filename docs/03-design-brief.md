# Design brief (for Claude Design)

Version 0.2, 2026-10-12. Read with `01-product-spec.md` (screens and flows) and `04-methodology-and-disclosure.md` (copy).

## 1. The job

Design a simple, clean, modern website where people answer about 50 quick questions about AI on their phones, get a result that feels meaningful, and share it with friends. It should feel calm, neutral and trustworthy, like a well-made public service with a bit of warmth, not like a personality-quiz app or a tech product launch.

## 2. Who it's for

Ordinary adults in Canada, the US, the UK and Australia, many of whom rarely use AI. Most will arrive on a phone from a link a friend shared. Many will have strong feelings about AI in one direction or the other; the design must not signal which side it is on.

## 3. Feel

- **Quiet.** Lots of white space, one accent colour used sparingly, no gradients, no glow, no illustrations of robots, brains or circuits.
- **Neutral.** Nothing that reads as optimistic or alarmist about AI, and nothing party-coded: no red/blue pairing for opposite ends of a scale.
- **Readable.** Large type for statements; generous line height; one idea per screen.
- **Friendly, not cute.** Rounded but not bubbly. No mascots, badges, confetti or streaks.
- **Shows its working.** Small, plain source lines under any number about other people.

## 4. Design system (new, product-specific)

Start from the **Find My AI Worldview** design system. A copy is checked in at `design/`: `design/tokens.json` (colours for light and dark, type, spacing, radii; the single source for the Tailwind theme) and `design/README.md` (the usage rules). `design/screens/*.dc.html` are the reference mockups (Main is the landing page; open them in a browser for layout and copy, ignore the `support.js` line; they are references, not code to copy). The editable originals live in Claude Design (private); when they change, the copy here is refreshed in the same commit as any spec change. It holds the colour tokens for light and dark, the type scale, spacing, radii and the usage rules; read its README first. It has no components yet: designing the components in section 5 and adding them to that system is part of this job. The table below records the direction it was built from:

| Area | Direction |
|---|---|
| Colour | Warm off-white background, near-black ink, two greys for structure, one muted accent (a calm teal works and has no party or brand baggage in these markets), plus a muted secondary used only for the second marker in comparisons. Full dark mode. All text at least 4.5:1 contrast. |
| Type | Atkinson Hyperlegible Next (Google Fonts), Noto Sans and the system sans as fallbacks. Body 19 px on every screen size; nothing below 16 px; statements 22 px on phones, 28 px on desktop; option labels 19 px medium. Sentence case everywhere, no all-caps labels. See section 9. |
| Shape | Medium corner radius on cards and options; answer rows at least 48 px tall with 6 px gaps, every other control at least 48 px, 8 px between other targets. On phones, buttons stack full width; two long labels never sit side by side. |
| Space | 4 px base grid; generous vertical rhythm; 16 px side gutters on phones; content column about 640 px wide on larger screens. |
| Motion | Minimal: a short fade/slide between questions (about 200 ms), the selected state shows for about 400 ms after tapping an answer before advancing; everything off with reduced motion. |
| Icons | A simple line icon set used sparingly (back, share, copy, info, check). |

## 5. Components

- Buttons: primary, secondary, quiet (text), icon button
- Progress: "Question 12 of 50" plus a thin constant-rate bar; "Aa" larger-text button in the quiz header
- Agree/disagree answer list: seven full-width rows labelled in words, middle row "Neither agree nor disagree"; selected state; no numbers; all seven plus the statement fit on one phone screen; shown disagree-first or agree-first per person
- Trade-off pair: two large statement cards, then a Slightly / Strongly follow-up
- Scenario options: four option rows under a short situation
- "How settled are your views?" end-of-section question
- Trust grid (four rows × four options) that stacks well on a phone
- Text input and checkbox (for the optional email and feedback)
- Result headline card: label "Your closest perspective", perspective name, tagline; variants for "You sit between A and B", "Your own combination", "Your views are still forming", "AI isn't high on your list"
- Construct track: a horizontal line between two labelled ends with one marker, band in words underneath; "not enough answers" state; comparison variant with two markers distinguished by shape (filled circle and ring) and labels ("You", "Sam"), not by colour alone
- Perspective chip ("Also near")
- "You and others" card: one sentence with a figure, plus a small source line
- Statement rows: "You agree that…", "You split on…"
- Share block: native share, copy link, platform buttons
- Share images: 1200×630 link preview and 1080×1080 square; perspective name, tagline, mini six-row profile, product name; works for every outcome type
- Version banner ("Scored with an earlier version. See what changed.")
- Expandable "Why did I get this?"
- Footer: How this works · Privacy · What's changed · Built with help from AI

## 6. Screens to design

1. Landing (default, and the compare-invite variant "Sam took this and wants to compare")
2. Before you start
3. Agree/disagree question (with progress, back, skip)
4. Trade-off question (both steps)
5. Scenario question
6. End-of-section "How settled are your views?"
7. "A few about you" (country, use, trust grid, free text)
8. Quick check (rate a description)
9. Results, closest perspective: full scrolling page in the order given in `01-product-spec.md` section 5.6
10. Results headline variants: in between, own combination, still forming, not a priority
11. Compare result (two markers on each track, agreements, splits)
12. Share images (both sizes, at least two outcome types)
13. How this works (long-form reading page)
14. Feedback form
15. Empty, loading and error states (offline, save failed with retry)

Phone first (390 px wide), then desktop. Light and dark.

## 7. Things to avoid

Gauges, dials, scores out of 100, percentages on a person's result, progress rewards, red/blue scales, stock AI imagery, dense paragraphs on the results page, anything that makes one perspective look better than another (all perspectives get the same visual treatment and the same weight on the page).

## 8. Content to use

Real copy only, no lorem ipsum: questions from `content/items.json`, perspectives from `content/perspectives.json`, results copy from `content/narratives.json`, base rates from `content/base-rates.json`, page copy from `docs/04-methodology-and-disclosure.md`. Use the longest real strings when checking layouts (C5-05 is the longest statement; "Human-Control Defenders" is the longest perspective name).

## 9. Why these type and layout choices

From a review of survey and accessibility practice (founder asked for "the best font and style for a survey like this", 2026-10-12):

- **Font.** In many popular geometric and neo-grotesque sans-serifs (Figtree, Inter and others) a capital I and a lowercase l are near-identical, so "AI" can read as the name "Al", on a site whose every screen says "AI". Atkinson Hyperlegible, designed with the Braille Institute for low-vision readers, gives I, l and 1, and 0 and O, distinct shapes. The Next version adds weights from 200 to 800 and is free on Google Fonts. Check the "AI" glyphs whenever a font change is proposed.
- **Size.** 19 px body text is the body size the GOV.UK Design System uses for a general public that includes many older and less confident readers; we keep it at 19 px on phones too. Small text never goes below 16 px; browser zoom and the "Larger text" button must both work.
- **Answer options.** A vertical list of fully labelled, equally sized options. Labelling every point gives more reliable answers than labelling only the ends, and works better with screen readers. A horizontal row of seven was tried and set aside: it fits more easily but labels only the ends. Studies find orientation itself changes answers little, but one found vertical lists draw slightly more extreme answers and warned against switching layout by device, so the layout is the same on every screen. All seven options must fit above the fold on a phone.
- **Answer direction.** Options listed first get picked slightly more often, and the evidence on agree-first versus disagree-first is mixed. So each person is randomly shown one direction and keeps it for the whole quiz; across everyone the pull cancels out. Selection shows fill, outline, check mark and bold together so it never depends on colour alone.
- **Tap targets.** 48 px answer rows and 48 px controls sit comfortably above WCAG 2.2 (2.5.8, 24 px minimum), Apple's 44 pt and Material's 48 dp guidance. The earlier screens put two long-label buttons side by side on a 390 px phone; they now stack.
- **Progress.** A constant-rate bar with a plain count is the honest option; speeding it up early or slowing it down to steer completion is a known dark pattern and is not allowed.
- **Auto-advance.** Moving on about 400 ms after a tap keeps a long agree/disagree run quick, as long as Back is always visible and earlier answers are kept.

