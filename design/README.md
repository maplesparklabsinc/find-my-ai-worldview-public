A quiet, neutral system for a website where people answer quick questions about AI, see where they land, and compare with friends. The questions and the person's answers are the content; the interface stays out of the way. Mobile first, and it should look just as considered on a desktop.

## Content fundamentals

- Write like you're talking to a friend or a colleague: "you" and "we", short sentences, everyday words. "Here's what stands out about your views", not "Your profile exhibits internal tension".
- No jargon on screen: never "construct", "dimension", "psychometric", "validated", "score".
- Never tell people they are right or wrong, and never make one perspective sound better than another.
- No hype or doom words, no exclamation marks in results, no emoji.
- Sentence case everywhere, including labels. No all-caps text.
- Left-aligned text; never justified.
- Survey statements are shown exactly as written in the item bank; do not restyle their wording.
- Canadian spelling.

## Visual foundations

**Colour.** Use `surface` for every page background and `surface-raised` for anything you tap or read as a unit (answer rows, cards, inputs). Set all main text in `ink` and secondary text in `ink-muted`. `accent` is the only accent: primary buttons, the selected answer, the person's own marker on result tracks, links, the progress bar and the focus ring. Put `on-accent` text on `accent` fills. Use `accent-soft` behind the selected answer and the result headline card. `second` exists only for the friend's marker in comparisons. There is no red, blue, green or warning colour in this system: nothing on a result is good or bad, and no pair of colours should read as two political parties.

**Admin world map.** Only the founder-facing admin map uses `map-1` to `map-5` (an area's answer count in five steps: 0–1, 2–4, 5–9, 10–19, 20 or more), with its number in the matching `on-map-1` to `on-map-5`. Every piece of land belongs to an area (Russia and Greenland with Elsewhere in Europe, Central Asia with South Asia), so there is no "not an option" colour. Every area always shows its number, so the shade never carries meaning alone, and the exact numbers are in a table under the map. Not for any public screen.

**Type.** One family, `sans`: Atkinson Hyperlegible Next from Google Fonts, with Noto Sans and the system sans as fallbacks. It was chosen because its capital I and lowercase l look different, so "AI" never reads as the name "Al", and because it separates other look-alike characters (0 and O, 1 and l). `statement` for survey statements, `display` for the perspective name, `title` for headings, `body` for running text, `option` for answer labels and buttons, `small` for source lines, labels and helper text. Nothing is ever smaller than `small` (16px), and body text never shrinks on phones. Use the larger desktop sizes noted on `display`, `title` and `statement` above 640px wide. Set sizes in rem so browser zoom works, and offer a "Larger text" option.

**Space and layout.** Phone first: one column with `space-4` side gutters, widening to `space-6` on larger screens. Questions and reading text never run wider than `measure-body` (640px), centred, on any screen. On wide screens the landing page may place its preview beside the text; the quiz and the results stay a single centred column. `space-2` between answer rows, `space-6` between blocks, `space-10` between results sections. More space above a heading than below it. One question per screen.

**Shape.** `radius-md` on answer rows, cards and buttons; `radius-sm` on inputs and checkboxes; `radius-pill` only for perspective chips and track markers. Answer options are full width and at least `tap-option` (48px) tall, 6px apart; every other control is at least `tap-min` (48px). Keep at least `space-2` between any two tap targets.

**Borders, not shadows.** Separate things with `surface-raised` against `surface` and a 1px `line-strong` border on controls. No drop shadows, gradients, glows or blur.

**Answer options.** A vertical stack, every point labelled in words, never numbers, the same layout on phones and desktops. The statement and all seven options must fit on one phone screen (about 390×660 visible) without scrolling; Skip sits in the header to make room. Every option gets the same height, spacing and colour. Each person sees the scale in one direction for the whole quiz: half start with "Strongly disagree" at the top, half with "Strongly agree". The selected option shows three things at once: `accent-soft` fill, a 2px `accent` outline and a check mark, with its label in bold. Colour never carries the selection alone.

**Buttons.** Primary: `accent` fill, `on-accent` text. Secondary: `surface-raised` fill, 1px `line-strong` border, `ink` text. Quiet: text only, in `ink-muted` or `accent`. On phones, stack buttons full width rather than squeezing two long labels side by side; on wide screens they can sit side by side at a natural width.

**Progress.** Honest and steady: "Question 12 of 50" in `small` `ink-muted`, above a 6px `accent` bar on a `line` track that fills at a constant rate, one step per question. Never speed it up or slow it down to nudge people, and don't label parts (the section order is shuffled per person).

**Result tracks.** Each of the six results is a neutral `line` track between two end labels in `ink-muted`, both ends styled the same, with the person's position as a filled `accent` disc. In comparisons the friend's position is a ring (2px `second` stroke, `surface-raised` fill) and both markers carry a name label, so the difference never depends on colour. The position's band is written underneath in `body`. Never show a number, a percentage or a gauge.

**States.** Focus: a solid 2px `accent` ring offset 2px on every interactive element. Disabled: `ink-muted` text on `surface`, no fill change.

**Motion.** After an answer is tapped, show the selected state, then move on after about 400ms; keep Back visible and keep earlier answers when people go back. A 200ms fade between questions. Nothing else moves. Turn both off under reduced motion.

**Imagery.** None. No illustrations of robots, brains, circuits or glowing networks, no stock photos.

## Iconography

A small set of simple line icons at 20px with a 1.5px stroke, in `ink` or `ink-muted`: back, share, copy, link, info, check, chevron, text size. Use an open-source line set such as Lucide; no emoji, no filled icons, no icon without a text label except back, close and text size (which carry an accessible name).
