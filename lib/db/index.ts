// The only code that talks to the database. Server only: importing this from a
// client component fails the build. Plain Postgres over DATABASE_URL
// (docs/01-product-spec.md section 3), so the host can change with a setting.
import "server-only";
import postgres from "postgres";
import { hashEditToken } from "@/lib/edit-token";
import type { FeedbackRow, ResearchContact, ResponsePatch, ResponseRow } from "@/lib/submit";

let client: postgres.Sql | null = null;

export function db(): postgres.Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare: false keeps this working through Supabase's transaction pooler.
  client = postgres(url, { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  return client;
}

/** Postgres error codes the routes turn into client errors. */
export const PG = { uniqueViolation: "23505", foreignKeyViolation: "23503" } as const;

export function pgCode(e: unknown): string | undefined {
  return e instanceof postgres.PostgresError ? e.code : undefined;
}

/**
 * Store a response with the hash of its edit token (lib/edit-token), and return
 * its ID. If a response with the same submission key is already stored (the
 * same quiz sent again after a lost reply), nothing is added: that response
 * gets the new edit token, since only the tab holding the key can send it, and
 * its ID is returned.
 */
export async function insertResponse(id: string, r: ResponseRow, editTokenHash: Uint8Array): Promise<string> {
  const sql = db();
  const submissionKeyHash = r.submission_key ? Buffer.from(hashEditToken(r.submission_key)) : null;
  const rows = await sql<{ id: string }[]>`
    insert into responses (
      id, scoring_version, taxonomy_version, item_bank_version, narratives_version, sequence_version,
      form, seed, answer_direction, answers, timings_ms, answer_changes,
      outcome_type, outcome_reason, closest_perspective, tension_id, country, result,
      quick_check_shown, quick_check_perspective, quick_check_rating, compared_with, edit_token_hash,
      submission_key_hash, prediction_kind, prediction_perspectives
    ) values (
      ${id}, ${r.scoring_version}, ${r.taxonomy_version}, ${r.item_bank_version}, ${r.narratives_version}, ${r.sequence_version},
      ${r.form}, ${r.seed}, ${r.answer_direction}, ${sql.json(r.answers as postgres.JSONValue)}, ${sql.json(r.timings_ms)}, ${sql.json(r.answer_changes)},
      ${r.outcome_type}, ${r.outcome_reason}, ${r.closest_perspective}, ${r.tension_id}, ${r.country},
      ${sql.json(r.result as unknown as postgres.JSONValue)},
      ${r.quick_check_shown}, ${r.quick_check_perspective}, ${r.quick_check_rating}, ${r.compared_with},
      ${Buffer.from(editTokenHash)}, ${submissionKeyHash}, ${r.prediction_kind}, ${r.prediction_perspectives}
    )
    on conflict (submission_key_hash) do update set edit_token_hash = excluded.edit_token_hash
    returning id`;
  return rows[0].id;
}

/** The stored edit-token hash of a response at any age, or null. Only for labelling, never for allowing a change. */
export async function getAnyEditTokenHash(id: string): Promise<Uint8Array | null> {
  const sql = db();
  const rows = await sql<{ edit_token_hash: Uint8Array | null }[]>`
    select edit_token_hash from responses where id = ${id}`;
  return rows[0]?.edit_token_hash ?? null;
}

/**
 * The stored edit-token hash of a response that can still be changed (the day
 * of completion and the day after), or null if there is no such response.
 */
export async function getEditTokenHash(id: string): Promise<Uint8Array | null> {
  const sql = db();
  const rows = await sql<{ edit_token_hash: Uint8Array | null }[]>`
    select edit_token_hash from responses where id = ${id} and completed_on >= current_date - 1`;
  return rows[0]?.edit_token_hash ?? null;
}

/**
 * Set result feedback (fit rating, better fit, track checks) or the compare name. Only allowed on the day of completion and
 * the day after: responses store a date, not a time, so this is the closest
 * match to "within 24 hours". Returns false if there is no such response or the
 * window has passed.
 */
export async function patchResponse(id: string, p: ResponsePatch): Promise<boolean> {
  const sql = db();
  const rows = await sql`
    update responses set
      fit_rating   = coalesce(${p.fit_rating ?? null}::smallint, fit_rating),
      better_fit   = coalesce(${p.better_fit ?? null}::text, better_fit),
      track_checks = track_checks || ${sql.json(p.track_checks ?? {})}
    where id = ${id} and completed_on >= current_date - 1
    returning 1`;
  return rows.length === 1;
}

/** Store a research contact. Leaving the same email twice for one response is a no-op. */
export async function insertResearchContact(c: ResearchContact): Promise<void> {
  const sql = db();
  await sql`
    insert into research_contacts (email, response_id, consent_version)
    values (${c.email}, ${c.response_id}, ${c.consent_version})
    on conflict (response_id, email) do nothing`;
}

/** `attachedVerified`: the attached result came with its edit token. */
export async function insertFeedback(f: FeedbackRow, attachedVerified: boolean): Promise<void> {
  const sql = db();
  await sql`
    insert into feedback (type, item_ids, perspective_ids, versions, body, evidence, email, may_quote, response_id, attached_verified)
    values (
      ${f.type}, ${f.item_ids}, ${f.perspective_ids}, ${sql.json({ ...f.versions })}, ${f.body}, ${f.evidence},
      ${f.email}, ${f.may_quote}, ${f.response_id}, ${f.response_id !== null && attachedVerified}
    )`;
}

/**
 * A stored response, as the result and compare pages need it. Never includes
 * emails, and never the prediction: these pages and share images are public.
 */
export interface StoredResponse {
  id: string;
  completed_on: Date;
  scoring_version: string;
  taxonomy_version: string;
  item_bank_version: string;
  narratives_version: string;
  answers: ResponseRow["answers"];
  result: ResponseRow["result"];
  compared_with: string | null;
}

export async function getResponse(id: string): Promise<StoredResponse | null> {
  const sql = db();
  const rows = await sql<StoredResponse[]>`
    select id, completed_on, scoring_version, taxonomy_version, item_bank_version, narratives_version,
           answers, result, compared_with
    from responses where id = ${id}`;
  return rows[0] ?? null;
}
