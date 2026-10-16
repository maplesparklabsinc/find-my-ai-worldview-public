# Design notes: how Find My AI Worldview was built, and why

This page is for other builders. It explains the main decisions behind the quiz, what each one cost, and what we chose not to do. The full, dated record is in `decisions.md`; this is the readable version.

I'm Walter Varma-Chang. I made the calls. ChatGPT and Claude did a lot of the research, writing and code, and both reviewed each other's work. Where a decision came from testing, I say so.

## What this is, and what it isn't

It's a 10-minute quiz that shows you where you land on six questions people disagree about with AI, and which of seven perspectives your answers are closest to. Then you can compare with a friend.

It isn't a personality test, a poll or a validated scale. The perspectives are hypotheses. The site says so, and the scoring is built so it can change as real answers come in.

## Principles

Every other decision follows from five rules.

1. **Honest over clever.** Nothing on the page may claim more than the project has shown.
2. **No false precision.** No percentages, scores or "87% match". You see a marker between two labelled ends, and a band in words.
3. **Not everyone fits a box.** "In between", "your own combination", "still forming" and "AI isn't high on your list" are real results, with the same care as a named perspective.
4. **Nothing personal unless you choose it.** No account, no name, no IP address, no tracking cookie.
5. **Content is data.** Every question, description and line of copy lives in versioned files, not in code. That makes every change reviewable, and every old result reproducible.

## What we measure

Six questions:

1. How much good will AI do?
2. How much harm?
3. How fast should new AI be released?
4. Who should set the rules?
5. Who should have the final say on decisions about people?
6. Who should share in the gains?

**Good and harm are scored separately.** Large polls keep finding that most people expect both. Ipsos frames it as "wonder vs worry", and the two often sit in the same person. A single optimism-pessimism slider would hide that.

**It isn't left versus right.** Views on AI don't follow party lines well, so the quiz doesn't ask about politics. The working name started as "Find My AI Politics" and was changed for that reason.

**Dimensions first, labels second.** The six answers are the result. The perspective is a summary on top. That keeps the result useful even when the label fits badly.

## The perspectives

The first draft had ten "tribes" and seven axes. Checked against published research, that was more structure than the evidence supports. When researchers sort the public by attitude, they usually find three to five groups, mostly on how much good and harm people expect. We cut to six perspectives, and later added a seventh.

**How the names were chosen.** The research literature uses plain words: optimists, ambivalents, skeptics, the indifferent. The press uses faction names, many given by opponents: doomers, accelerationists, decels, Luddites. People rarely call themselves by those. So each perspective has a neutral name someone could wear, and a short line, "Elsewhere you might hear", that maps it to the outside labels. The insults only appear as what critics say.

**Skeptics was added before launch.** A naming review found a group in every public segmentation that our six didn't describe: people who doubt AI will do much good for ordinary people, and who see real costs now. Without it, those people were placed on Precautionists, who worry about something different: powerful AI going wrong.

**Every perspective comes with its strongest objection.** Describing a view fairly includes saying what its critics would say.

**Not added, for now:** Rights-First, Open Access, Strategic Sovereignty, Frontier Risk and Human Connection. Each would need its own questions, and adding all of them would push the quiz to about 70 questions. They're logged as candidates, to test with real answers.

## How a result is worked out

- For each of the six questions, average your answers and place you on a scale from -3 to +3.
- Each perspective has a typical position on each question, plus a weight for how much that question defines it.
- Your result is the perspective at the shortest weighted distance.
- If two are about equally close, you're "in between". If none is close, it's "your own combination".
- Two safety nets run first:
  - **Still forming:** you said you're unsure on several themes and your answers are mild.
  - **Not a priority:** you expect little good or harm, and said AI isn't very important to you.

**Trade-off: raw scale now, calibration later.** Without real data, the scales are anchored on the statements themselves, not on how people actually answer. Most people agree with protective statements, so results bunch toward "public rules" and "humans decide". The alternative, re-centring to spread results evenly, would make the results look balanced without being more accurate. So results are labelled provisional. After about 500 research-consented responses, we check which questions work and whether people say their result fits. Only then do we decide whether to calibrate against real answers.

**Rejected: ranking your own answers against each other** ("which question stands out most for you"). It avoids the calibration problem, but it makes two people's results impossible to compare, which breaks comparing with a friend.

## Writing the questions

- **Five statements per question, written from both sides.** Agreeing with everything doesn't push you anywhere. An outside review found that several of the "other side" statements could be agreed with from opposite positions, so they were rewritten to be true opposites.
- **One scope per theme.** Early statements mixed "a new AI tool" with "powerful new AI". So "it depends on the stakes" read as strongly cautious. Each theme now uses one scope.
- **No "Not sure" option.** No-opinion options tend to attract people avoiding effort, without improving the data. You can skip any question, and a separate "how settled are you?" question feeds the "still forming" result.
- **Answer direction is counterbalanced.** Half of people see "Strongly disagree" first and half see "Strongly agree" first, fixed for the whole quiz. People pick the first options slightly more often, and this cancels that out.
- **Order is shuffled per person** from a stored seed, so any quiz can be reproduced exactly.
- **One question is collected but not scored.** It asks whether low-risk AI should be left mostly alone, or meet a basic set of public rules for all AI. Its first wording drew almost everyone to one side, so it was rewritten before launch. Whether it should become part of the scoring will be decided from real answers, not guessed.

## Testing before real people

Before any human took it, we ran AI role-play test-takers: personas with stated beliefs, across several model sizes. Their answers went through the real scorer.

**What it's good for:** finding statements that most test-takers read two ways, results a profile can't reach, and safety nets that don't catch the people they're for.

**What it isn't:** evidence about people. Language models are worse than people at being genuinely unsure, and they over-agree with pleasant policies.

**What it changed:**
- the release-pace scope
- six reworded statements
- both safety-net thresholds
- the wording of the collected-but-not-scored question
- where Skeptics sits

A different model family ran the same test packets independently, and the findings were compared before anything changed.

## Checking whether results describe people

Some research tools are built into the results page:

- **Does this fit you?** One tap, after your result.
- **A guess before the result:** where you think you'll land. It never changes the result.
- **A quick check for 1 in 4 people:** rate a short description before seeing your result. Half the time it's your own perspective's, half the time another's. If people rate a random description as highly as their own, the descriptions aren't saying much. This is a known problem with personality-style results (the Barnum effect).

**Trade-off: research value against a tired person at the end of a 51-question quiz.** Nobody sees both the guess and the quick check, and each takes one tap.

## Privacy

- Answers are stored with the completion date, not a timestamp, and with no IP address, device details or cookies.
- Your IP address is used briefly to limit abuse, and then forgotten.
- No names anywhere. An earlier version let you add a first name to a compare link; it was removed as one less piece of personal data.
- The optional research email is kept separate, never shown, and deleted on request.
- A result link shows your result to anyone who has it. Only the browser that saved it can rate it or attach an email, using a private token.
- Data is stored in Canada. The database is used as plain Postgres through a connection string, so the host can change without rewriting the app.

## Sharing and comparing

**One link does everything.** Sharing a result sends a read-only page that leads with "Take the quiz and compare". The image alone can't be clicked, so the link has to bring people in. A separate compare link with a name was simpler to explain on paper, and more confusing in practice.

## Design

- **The font is Atkinson Hyperlegible Next.** The first font made "AI" read as "Al" (a capital I and a lowercase l looked alike). Body text is at least 16 pixels.
- **Mobile first.** Every question and all seven answer options fit on one phone screen.
- **Answers are a fully labelled vertical list.** A horizontal row was tried and set aside: labelled points give more reliable answers and work with screen readers.
- **No red and blue poles, and colour never carries meaning alone.** AI views aren't partisan, and the design shouldn't suggest they are.

## Changing it over time

- **Every saved result records the versions** of the questions, perspectives, scoring and wording it was made with. Each version is frozen in the code.
- **A shared link keeps showing the result as it was**, with a note that a newer version exists.
- **Questions:** clearer wording keeps a question's ID. A change in meaning gets a new ID, and the old question is retired, never mixed with the new one.
- **When the scoring changes**, stored answers can be re-scored to measure how many results would move, and that number is published.

## How it was built

- **Workflow:** one person, two AI systems.
  - A chat session with Claude wrote the specs, the questions and the GitHub issues, and reviewed every change.
  - Claude Code wrote the code from those issues.
  - ChatGPT ran independent reviews.
  - I made the decisions and tested it as a plain user.
- **Scoring is defined twice.** A short Python reference version defines it; the TypeScript in the app must match it exactly on a set of test cases, in the browser and again on the server.
- **This repository is a published snapshot**, updated at each release. Development happens in a private repository. Issue numbers in the code refer to that tracker.

## Open questions

- Do the seven perspectives describe real people? The fit answers and the quick check will say.
- Is "who should share in the gains" a perspective, or a value almost everyone holds?
- Should the case-by-case question become part of the scoring?
- Will calibration against real answers be needed, and how many results would it change?

If you build something similar and want to compare notes, use "Tell us" on the site.
