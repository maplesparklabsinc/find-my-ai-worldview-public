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
// answers and feedback on the result, without emails or free text. Free-text
// answers never leave the database (only whether there was one), and neither
// research_contacts nor feedback is read.
import "server-only";
import { DAYS, RULES_DEPEND_ITEM, type AdminRaw } from "@/lib/admin";
import { PAGE_SIZE, type ResponseDetailRaw, type ResponseListRaw, type ResultFilter } from "@/lib/admin/responses";
import type { Versions } from "@/lib/content";
import { db } from "./index";

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
      fit,
      betterFit,
      rulesDepend,
      tracks,
      skips,
      changes,
      feedback,
      [feedbackWeek],
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
      sql<AdminRaw["fit"]>`
        select case when outcome_type = 'matched' then closest_perspective end as perspective,
               fit_rating::int as rating, count(*)::int as n
        from responses
        where ${current} and fit_rating is not null
        group by 1, 2`,
      sql<AdminRaw["better_fit"]>`
        select case when outcome_type = 'matched' then closest_perspective end as perspective,
               better_fit as pick, count(*)::int as n
        from responses
        where ${current} and better_fit is not null
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
    ]);

    return {
      today: today.today,
      totals,
      research_active: research.active,
      daily: [...daily],
      outcomes: [...outcomes],
      fit: [...fit],
      better_fit: [...betterFit],
      rules_depend: [...rulesDepend],
      tracks: [...tracks],
      skips: [...skips],
      changes: [...changes],
      feedback: [...feedback],
      feedback_last_7_days: feedbackWeek.n,
    };
  });
}

/** One page of responses under a release, newest first, and how many there are in all. */
export async function listResponses(
  v: Versions,
  filter: ResultFilter | null,
  page: number,
): Promise<{ rows: ResponseListRaw[]; total: number }> {
  const sql = db();
  const where = sql`
    scoring_version = ${v.scoring} and taxonomy_version = ${v.taxonomy}
    and item_bank_version = ${v.item_bank} and narratives_version = ${v.narratives}
    ${filter ? sql`and outcome_type = ${filter.outcome_type}` : sql``}
    ${filter?.perspective ? sql`and closest_perspective = ${filter.perspective}` : sql``}`;
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const [rows, [count]] = await Promise.all([
      tx<ResponseListRaw[]>`
        select id, completed_on::text, outcome_type, outcome_reason,
               result #>> '{outcome,ranked,0,id}' as first, result #>> '{outcome,ranked,1,id}' as second,
               fit_rating::int, prediction_kind, prediction_perspectives,
               quick_check_shown, quick_check_perspective, quick_check_rating::int,
               (select count(*) from jsonb_object_keys(answers))::int as answered
        from responses where ${where}
        order by completed_on desc, id
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`,
      tx<{ n: number }[]>`select count(*)::int as n from responses where ${where}`,
    ]);
    return { rows: [...rows], total: count.n };
  });
}

/** One response for /admin/responses/{id}. Free-text answers (the only string answers) are left in the database. */
export async function readResponse(id: string): Promise<ResponseDetailRaw | null> {
  const sql = db();
  const rows = await sql<ResponseDetailRaw[]>`
    select id, completed_on::text, scoring_version, taxonomy_version, item_bank_version, narratives_version,
           sequence_version, form, seed::text, answer_direction,
           (select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from jsonb_each(answers) e(k, a) where jsonb_typeof(a) <> 'string') as answers,
           exists (select 1 from jsonb_each(answers) e(k, a) where jsonb_typeof(a) = 'string') as free_text_answered,
           result, fit_rating::int, better_fit, track_checks, prediction_kind, prediction_perspectives,
           quick_check_shown, quick_check_perspective, quick_check_rating::int
    from responses where id = ${id}`;
  return rows[0] ?? null;
}
