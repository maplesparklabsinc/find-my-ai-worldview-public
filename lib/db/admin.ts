// Reads for the admin pages. Server only.
//
// The dashboard (/admin, issue #14) reads counts and shares only: no response
// rows, no answers (except CX-T1, counted), no D9 free text, and no email
// addresses (feedback says only whether one was given). Everything is read in
// one read-only transaction, so the numbers on the page agree with each other.
// Tables other than totals and per day are limited to the current content
// release; skips and changed answers to the current item bank.
//
// /admin/responses (issue #37) reads single responses: their versions, result,
// answers and feedback on the result. Since issue #51 it also reads the
// free-text answer and feedback text (masked by lib/admin before they reach a
// page) and whether there is a research row (withdrawn or not).
//
// No query here ever selects an email column: research_contacts is read only
// for created_on and withdrawn, and feedback.email only as "is not null"
// (lib/admin/__tests__/no-email.test.ts checks this file).
import "server-only";
import { DAYS, RULES_DEPEND_ITEM, type AdminRaw } from "@/lib/admin";
import type { ResponseDetailRaw, ResponseListRaw } from "@/lib/admin/responses";
import type { Versions } from "@/lib/content";
import type { ExportFeedbackRaw, ExportResponseRaw } from "@/lib/admin/export";
import type { AdminRow } from "@/lib/admin/insights";
import { db } from "./index";

export interface LocationRaw {
  item_bank_version: string;
  option: number | null;
  all_time: number;
  last_7_days: number;
}

export interface SharingRaw {
  total: number;
  compared: number;
  targets: number;
  top: { id: string; n: number }[];
}

export async function readAdmin(v: Versions): Promise<AdminRaw> {
  return db().begin("isolation level repeatable read read only", async (sql) => {
    const current = sql`
      scoring_version = ${v.scoring} and taxonomy_version = ${v.taxonomy}
      and item_bank_version = ${v.item_bank} and narratives_version = ${v.narratives}`;

    const [
      [today],
      [totals],
      [research],
      daily,
      outcomes,
      rulesDepend,
      tracks,
      skips,
      changes,
      feedback,
      [feedbackWeek],
      [feedbackTotal],
    ] = await Promise.all([
      sql<{ today: string }[]>`select current_date::text as today`,
      sql<AdminRaw["totals"][]>`
        select today::int, last_7_days::int, all_time::int from v_totals`,
      sql<{ active: number }[]>`select active::int from v_research_contacts`,
      sql<AdminRaw["daily"]>`
        select completed_on::text as day, completions::int as n
        from v_daily where completed_on > current_date - ${DAYS}::int`,
      sql<AdminRaw["outcomes"]>`
        select outcome_type, case when outcome_type = 'matched' then closest_perspective end as perspective, count(*)::int as n
        from responses where ${current}
        group by 1, 2`,
      sql<AdminRaw["rules_depend"]>`
        select outcome_type, case when outcome_type = 'matched' then closest_perspective end as perspective,
               (answers -> ${RULES_DEPEND_ITEM}::text ->> 'choice')::int as choice,
               answers -> ${RULES_DEPEND_ITEM}::text ->> 'strength' as strength, count(*)::int as n
        from responses
        where ${current} and answers -> ${RULES_DEPEND_ITEM}::text is not null
        group by 1, 2, 3, 4`,
      sql<AdminRaw["tracks"]>`
        select t.key as construct, t.value #>> '{}' as answer, count(*)::int as n
        from responses r cross join lateral jsonb_each(r.track_checks) t
        where ${current}
        group by 1, 2`,
      sql<AdminRaw["skips"]>`
        select item, skip_rate::float8 as skip_rate
        from v_skips where item_bank_version = ${v.item_bank} and skipped > 0
        order by skip_rate desc, item
        limit 5`,
      sql<AdminRaw["changes"]>`
        select item, total_changes::int
        from v_answer_changes where item_bank_version = ${v.item_bank} and total_changes > 0
        order by total_changes desc, item
        limit 3`,
      sql<AdminRaw["feedback"]>`
        select created_on::text, type, item_ids, perspective_ids, body, may_quote, response_id,
               attached_verified, (email is not null) as has_email
        from feedback
        order by created_on desc, id desc
        limit 20`,
      sql<{ n: number }[]>`
        select count(*)::int as n from feedback where created_on >= current_date - 6`,
      sql<{ n: number }[]>`select count(*)::int as n from feedback`,
    ]);

    return {
      today: today.today,
      totals,
      research_active: research.active,
      daily: [...daily],
      outcomes: [...outcomes],
      rules_depend: [...rulesDepend],
      tracks: [...tracks],
      skips: [...skips],
      changes: [...changes],
      feedback: [...feedback],
      feedback_last_7_days: feedbackWeek.n,
      feedback_total: feedbackTotal.n,
    };
  });
}

/**
 * Every response under a release, newest first, for the list page, which
 * filters and pages them in lib/admin/responses (the quality flags and the In
 * between pairs need every row). Answers without free text, for the flags.
 */
export async function listResponses(v: Versions): Promise<ResponseListRaw[]> {
  const sql = db();
  const rows = await sql<ResponseListRaw[]>`
    select id, completed_on::text, outcome_type, outcome_reason,
           result #>> '{outcome,ranked,0,id}' as first, result #>> '{outcome,ranked,1,id}' as second,
           fit_rating::int, prediction_kind, prediction_perspectives,
           quick_check_shown, quick_check_perspective, quick_check_rating::int,
           (select count(*) from jsonb_object_keys(answers))::int as answered,
           (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from jsonb_each(answers) e(k, a) where jsonb_typeof(a) <> 'string') as answers,
           timings_ms,
           (select bool_or(not rc.withdrawn) from research_contacts rc where rc.response_id = responses.id) as research_active
    from responses
    where scoring_version = ${v.scoring} and taxonomy_version = ${v.taxonomy}
      and item_bank_version = ${v.item_bank} and narratives_version = ${v.narratives}
    order by completed_on desc, id`;
  return [...rows];
}

/**
 * One response for /admin/responses/{id}, with its research rows (date and
 * withdrawn only) and the feedback attached to it (whether an address was
 * left, never the address). Free-text answers are the string answers.
 */
export async function readResponse(id: string): Promise<ResponseDetailRaw | null> {
  const sql = db();
  const rows = await sql<ResponseDetailRaw[]>`
    select id, completed_on::text, scoring_version, taxonomy_version, item_bank_version, narratives_version,
           sequence_version, form, seed::text, answer_direction,
           (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from jsonb_each(answers) e(k, a) where jsonb_typeof(a) <> 'string') as answers,
           (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from jsonb_each_text(answers) e(k, a)
             where jsonb_typeof(answers -> k) = 'string') as free_text,
           result, timings_ms, fit_rating::int, better_fit, track_checks, answer_changes, compared_with,
           prediction_kind, prediction_perspectives,
           quick_check_shown, quick_check_perspective, quick_check_rating::int,
           (select coalesce(jsonb_agg(jsonb_build_object('created_on', rc.created_on::text, 'withdrawn', rc.withdrawn) order by rc.created_on), '[]'::jsonb)
              from research_contacts rc where rc.response_id = responses.id) as research,
           (select coalesce(jsonb_agg(jsonb_build_object(
                      'created_on', f.created_on::text, 'type', f.type, 'may_quote', f.may_quote,
                      'body', f.body, 'has_email', f.email is not null) order by f.created_on, f.id), '[]'::jsonb)
              from feedback f where f.response_id = responses.id) as feedback
    from responses where id = ${id}`;
  return rows[0] ?? null;
}

/** Total time on each response under a release, for the "too fast" median (lib/admin/quality). */
export async function readReleaseTotals(v: Versions): Promise<number[]> {
  const sql = db();
  const rows = await sql<{ total: number }[]>`
    select (select coalesce(sum(t::float8), 0) from jsonb_each_text(timings_ms) e(k, t))::float8 as total
    from responses
    where scoring_version = ${v.scoring} and taxonomy_version = ${v.taxonomy}
      and item_bank_version = ${v.item_bank} and narratives_version = ${v.narratives}`;
  return rows.map((r) => r.total);
}

// ---------- Issue #55: the cards built from single responses, and the export ----------
//
// The cards read the current release's responses without free text (string
// answers) or any email. The export reads free text (masked in lib/admin/export)
// and, from research_contacts and feedback, only whether there is a row and
// whether an email was left, never the address.

/** The current release's responses, for the cards in lib/admin/insights. */
export async function readAdminRows(v: Versions): Promise<AdminRow[]> {
  const sql = db();
  const rows = await sql<AdminRow[]>`
    select id, completed_on::text, form, seed::float8 as seed, answer_direction,
           (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from jsonb_each(answers) e(k, a) where jsonb_typeof(a) <> 'string') as answers,
           timings_ms, answer_changes, outcome_type,
           (select coalesce(jsonb_agg(jsonb_build_object('id', x ->> 'id', 'distance', (x ->> 'distance')::float8) order by n), '[]'::jsonb)
              from jsonb_array_elements(result #> '{outcome,ranked}') with ordinality t(x, n) where n <= 2) as ranked,
           (select coalesce(jsonb_object_agg(k, c -> 'band'), '{}'::jsonb) from jsonb_each(result -> 'constructs') e(k, c)) as bands,
           fit_rating::int, better_fit, quick_check_shown, prediction_kind, prediction_perspectives, outcome_reason
    from responses
    where scoring_version = ${v.scoring} and taxonomy_version = ${v.taxonomy}
      and item_bank_version = ${v.item_bank} and narratives_version = ${v.narratives}
    order by completed_on, id`;
  return [...rows];
}

/**
 * Where people say they live (D11, the option index; null for not answered), all time and the last 7 days.
 * All releases, by item bank version, since the options differ between versions.
 */
export async function readLocation(): Promise<LocationRaw[]> {
  const sql = db();
  const rows = await sql<LocationRaw[]>`
    select item_bank_version,
           case when jsonb_typeof(answers -> 'D11') = 'number' then (answers ->> 'D11')::int end as option,
           count(*)::int as all_time,
           count(*) filter (where completed_on >= current_date - 6)::int as last_7_days
    from responses
    group by 1, 2`;
  return [...rows];
}

/** Compare links: how many responses came from one, how many people were compared with, and the five most compared with. All releases. */
export async function readSharing(): Promise<SharingRaw> {
  return db().begin("isolation level repeatable read read only", async (sql) => {
    const [[counts], top] = await Promise.all([
      sql<Omit<SharingRaw, "top">[]>`
        select count(*)::int as total, count(compared_with)::int as compared, count(distinct compared_with)::int as targets
        from responses`,
      sql<SharingRaw["top"]>`
        select compared_with as id, count(*)::int as n
        from responses where compared_with is not null
        group by 1 order by 2 desc, 1
        limit 5`,
    ]);
    return { ...counts, top: [...top] };
  });
}

/** The anonymous export: responses and feedback, optionally for one release and a date range (inclusive). */
export async function readExport(
  v: Versions | null,
  from: string | null,
  to: string | null,
): Promise<{ responses: ExportResponseRaw[]; feedback: ExportFeedbackRaw[] }> {
  return db().begin("isolation level repeatable read read only", async (sql) => {
    const release = v
      ? sql`and scoring_version = ${v.scoring} and taxonomy_version = ${v.taxonomy}
            and item_bank_version = ${v.item_bank} and narratives_version = ${v.narratives}`
      : sql``;
    const feedbackRelease = v
      ? sql`and versions ->> 'scoring' = ${v.scoring} and versions ->> 'taxonomy' = ${v.taxonomy}
            and versions ->> 'item_bank' = ${v.item_bank} and versions ->> 'narratives' = ${v.narratives}`
      : sql``;
    const dates = (col: "completed_on" | "created_on") =>
      sql`${from ? sql`and ${sql(col)} >= ${from}::date` : sql``} ${to ? sql`and ${sql(col)} <= ${to}::date` : sql``}`;
    const [responses, feedback] = await Promise.all([
      sql<ExportResponseRaw[]>`
        select id, completed_on::text, scoring_version, taxonomy_version, item_bank_version, narratives_version,
               form, answer_direction,
               (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from jsonb_each(answers) e(k, a) where jsonb_typeof(a) <> 'string') as answers,
               (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from jsonb_each_text(answers) e(k, a)
                 where jsonb_typeof(answers -> k) = 'string') as free_text,
               timings_ms, outcome_type, outcome_reason, closest_perspective,
               result #>> '{outcome,ranked,0,id}' as first, result #>> '{outcome,ranked,1,id}' as second,
               (select coalesce(jsonb_object_agg(k, c -> 'band'), '{}'::jsonb) from jsonb_each(result -> 'constructs') e(k, c)) as bands,
               country, fit_rating::int, better_fit, track_checks, prediction_kind, prediction_perspectives,
               quick_check_shown, quick_check_perspective, quick_check_rating::int, compared_with,
               (select bool_or(not rc.withdrawn) from research_contacts rc where rc.response_id = responses.id) as research_active
        from responses
        where true ${release} ${dates("completed_on")}
        order by completed_on, id`,
      sql<ExportFeedbackRaw[]>`
        select created_on::text, type, item_ids, perspective_ids, body, may_quote, response_id, (email is not null) as has_email
        from feedback
        where true ${feedbackRelease} ${dates("created_on")}
        order by created_on, id`,
    ]);
    return { responses: [...responses], feedback: [...feedback] };
  });
}
