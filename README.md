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

## Testing on a phone

Nothing is deployed until launch. To try the quiz on a phone, run it on your computer.

**Same Wi-Fi (simplest).**

1. `npm ci` once, then `npm run dev:lan`.
2. Find your computer's local address: on a Mac, System Settings → Wi-Fi → Details → IP address (something like `192.168.1.23`).
3. On the phone, open `http://192.168.1.23:3000`.

The computer has to stay awake with the terminal open. If the page doesn't load, your Wi-Fi may keep devices apart (common on guest and office networks); use the tunnel below instead.

**Testers somewhere else (free temporary tunnel).**

1. Run `SITE_PASSWORD="pick-something" npm run share`.
2. It builds the site, starts it, and opens a [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) (no account needed).
3. Send testers the `https://….trycloudflare.com` address it prints, plus the password. They can type any user name.

The address changes every time you run it and stops working when you press Ctrl+C. The command won't start without a password.

Completed quizzes are saved to whatever database `DATABASE_URL` points at, so use the development database for testing.

## Environment

Set in Vercel project settings (and in `.env.local` for local work, which git ignores). Never commit them.

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres connection string (Supabase). Server only. |
| `SITE_PASSWORD` | Optional. Puts the whole site behind a password (HTTP Basic auth, any user name). |
| `ADMIN_PASSWORD` | Password for the read-only admin pages (any user name), needed even when `SITE_PASSWORD` is off. If it isn't set, they return 404. In production use at least 32 random characters; there is no lockout, so a Vercel firewall rate rule on `/admin` limits guessing. `/admin` shows what's coming in; `/admin/perspectives` shows every perspective and other result exactly as the content files word them (add `?release=<key>`, or use its version picker, to see a frozen older release). |
| `SITE_URL` | Optional. Absolute base URL for share previews on preview deploys. |
| `ENABLE_DEV_PAGE` | Optional, at build time. `1` keeps the `/dev` test page in a production build. |

## Admin notes

- **Migrations.** `npm run db:migrate` applies `db/migrations/*.sql` in order to `DATABASE_URL` (`-- --dry` lists what's pending). Run it on the development database first.
- **Withdrawing from research contact.** `npm run withdraw -- <email>` deletes that address's `research_contacts` row and clears it from any `feedback` it was left with (the feedback stays), in the database in `DATABASE_URL` (from `.env.local`). It prints only "Deleted 1 row." or "No matching row.", plus a count of feedback entries cleared, never the address; the private runbook covers the rest.
- **Feedback with a result attached.** Anyone with a result link can attach it to feedback. On `/admin`, an attachment sent from the browser that saved the result reads "Their result"; any other reads "Attached result (unverified)".

## Publishing

This repository is private. The public repository is a clean snapshot, one commit per release, with no history, issues or pull requests.

1. Merge to `main` and pull, with no uncommitted changes.
2. `npm run publish:public -- --dry` exports the tracked files at `HEAD`, leaves out what `scripts/public-exclude.txt` lists (agent instructions, CI, the environment template) and scans the rest: `gitleaks`, any email address other than the contact address, private session, artifact and Google Drive links, and database connection strings. It prints the file and line of each finding, never the value, and keeps the export in a temp folder so it can be read.
3. `npm run publish:public -- --to <local clone of the public repo>` does the same, adds `NOTICE.md`, replaces everything in the clone except `.git`, and makes one commit as Maple Spark Labs ("Release <versions> (<date>)", with the private commit in the body). `--rev <git rev>` publishes an earlier commit on `main`.
4. Review it with `git -C <clone> show --stat`, then push it yourself. The script never pushes.

## AI use

This project was drafted with substantial help from ChatGPT (OpenAI) and Claude (Anthropic). The founder makes and records all decisions. See `docs/04-methodology-and-disclosure.md` and `docs/decisions.md`.

## Contact

To report a problem, use the "Tell us" page on the site. For questions or collaboration, email findmyaiworldview@maplesparklabs.com.

## Licence and use

© 2026 Maple Spark Labs Inc. Code: MIT (see `LICENSE`). Questions, perspective descriptions, site copy, research files, docs and design: CC BY-NC 4.0 (see `content/LICENSE`), which means you can reuse them with credit, but not commercially. Please don't use this quiz or its results to make decisions about people, such as hiring, lending, admissions or political targeting. It was built to help people understand and talk about their own views.
