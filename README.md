# Find My AI Worldview

An educational self-assessment that helps people put their views about AI into words, see the trade-off that matters most to them, and find real common ground with people who see it differently. Working name; a project of Maple Spark Labs.

**Why it's built this way:** see `docs/05-design-notes.md`.

**Status:** The quiz, results, sharing, compare and admin are built; launch is pending. Until launch it runs on a computer against a development database (M4 tracks what's left). Nothing here is validated yet; see `docs/04-methodology-and-disclosure.md` for what that means.

## Layout

```
app/          Next.js app (App Router): the quiz, result and compare pages, API routes, /admin
components/   screens and shared UI
lib/          content loaders, scoring, question order, saving, result pages, database access
db/           SQL migrations
scripts/      design tokens, migrations, content freeze, research withdrawal, sharing a local build, the public snapshot
e2e/          Playwright tests
content/      data the app reads: items, perspectives, narratives, base rates, scoring config
reference/    executable scoring spec (Python), test vectors, simulation
research/     evidence ledger and item bank sources (CSV + generator)
docs/         overview, specs, methodology copy, decision log
CLAUDE.md     instructions for Claude Code (not in the public snapshot)
```

## Working with the content

```
python3 -I research/build_item_bank.py research/item-bank.csv
python3 -I reference/build_content.py
python3 -I reference/make_test_vectors.py
```

Edit the generator, not the generated files.

## Development database

Development uses a database with made-up data only, never a copy of real answers. There are two ways to run one.

**A hosted development database (no install).** Any hosted Postgres works, such as a free Neon project.

1. Create the project, and put its connection string in `.env.local` as `DATABASE_URL`. Copy `.env.example` to start.
2. Add the database's host name, without the user name or password, as `SEED_ALLOWED_HOST`. This is the one hosted database the seed may write to.
3. Run `npm run db:migrate`, then `npm run db:seed`, then `npm run dev`. Set `ADMIN_PASSWORD` to anything to open `/admin`.

**Postgres in Docker (fully offline).** Docker must be running.

1. `npm run db:up` starts it (on `127.0.0.1:54329`, reachable only from this computer) and runs the migrations on its two databases: `fmaw_dev` for `npm run dev`, and `fmaw_test` for `E2E_DB=1 npm run e2e`, which can wipe it freely.
2. Copy `.env.example` to `.env.local`; its `DATABASE_URL` already points at `fmaw_dev`. Set `ADMIN_PASSWORD` to anything to open `/admin`.
3. `npm run db:seed`, then `npm run dev`.

`npm run db:seed` fills the database with about 60 made-up responses, research sign-ups and feedback (addresses at example.com only). It empties those tables first, so running it again gives the same data. It refuses anything but the local database or the host in `SEED_ALLOWED_HOST`. `npm run db:reset` drops and recreates both local databases, migrates them and seeds `fmaw_dev`; it's local only. `npm run db:down` stops the local database and keeps its data. The production connection string never goes in `.env.local`.

## Load test

`npm run load-test` simulates people finishing the quiz on your own copy of the site: each sends a completed quiz, then two or three follow-up saves a few seconds apart. It prints requests per second, errors by status and save times (p50, p95, p99). It refuses any host but `localhost` and `127.0.0.1`, and starts nothing itself:

1. `npm run db:reset` (a fresh local database).
2. `npm run build && npx next start` in one terminal.
3. `npm run load-test` in another: 300 people over 2 minutes against `http://127.0.0.1:3000`. Add `-- --people 1000` for more, or a different URL such as `-- http://localhost:3200`.

It tests the app and our code with the database it runs against, not the hosted database's own limits.

## Operations

How the site is run (environments, passwords, deployment, the admin pages, publishing) is documented privately.

## AI use

This project was drafted with substantial help from ChatGPT (OpenAI) and Claude (Anthropic). The founder makes and records all decisions. See `docs/04-methodology-and-disclosure.md` and `docs/decisions.md`.

## Contact

To report a problem, use the "Tell us" page on the site. For questions or collaboration, email findmyaiworldview@maplesparklabs.com.

## Licence and use

© 2026 Maple Spark Labs Inc. Code: MIT (see `LICENSE`). Questions, perspective descriptions, site copy, research files, docs and design: CC BY-NC 4.0 (see `content/LICENSE`), which means you can reuse them with credit, but not commercially. Please don't use this quiz or its results to make decisions about people, such as hiring, lending, admissions or political targeting. It was built to help people understand and talk about their own views.
