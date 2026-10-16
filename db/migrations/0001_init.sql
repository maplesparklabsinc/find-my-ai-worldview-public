-- Tables and totals views (docs/01-product-spec.md section 6).
--
-- The app reads and writes only from server routes over DATABASE_URL. Row-level
-- security is on for every table with no policies, and the Supabase API roles
-- get no privileges, so nothing here is reachable from a browser even with a
-- leaked public key.
--
-- No IP addresses, user agents or timestamps on responses: the completion date
-- only. Emails live only in research_contacts and feedback and never appear in
-- a view.

-- Responses ----------------------------------------------------------------

create table responses (
  id                  text primary key check (id ~ '^[A-Za-z0-9]{12,32}$'),
  completed_on        date not null default current_date,

  scoring_version     text not null,
  taxonomy_version    text not null,
  item_bank_version   text not null,
  narratives_version  text not null,
  sequence_version    text not null,

  form                text not null,
  seed                bigint not null check (seed between 0 and 4294967295),
  answer_direction    text not null check (answer_direction in ('disagree_first', 'agree_first')),

  -- Answers in canonical order, keyed by item ID ("D3:<construct>" for confidence probes); skipped items are absent.
  answers             jsonb not null check (jsonb_typeof(answers) = 'object'),
  -- Time spent per question in ms, keyed like answers.
  timings_ms          jsonb not null default '{}' check (jsonb_typeof(timings_ms) = 'object'),

  -- The result, recomputed on the server with the shared scoring module before saving.
  outcome_type        text not null check (outcome_type in ('matched', 'mixed_between', 'mixed_unmatched', 'undecided', 'indifferent')),
  outcome_reason      text check (outcome_reason in ('coverage', 'confidence')),
  closest_perspective text,
  tension_id          text,
  country             text,
  result              jsonb not null check (jsonb_typeof(result) = 'object'),

  -- Quick check (1 in 4 people): which description was shown and the rating.
  quick_check_shown   text check (quick_check_shown in ('own', 'other')),
  quick_check_perspective text,
  quick_check_rating  smallint check (quick_check_rating between 1 and 5),

  -- "Does this fit you?" (1 to 5), set after the result is shown.
  fit_rating          smallint check (fit_rating between 1 and 5),

  -- Optional first name shown only on this response's compare landing page.
  compare_name        text check (char_length(compare_name) between 1 and 40),
  -- Set when this person took the quiz from a friend's compare link.
  compared_with       text references responses (id) on delete set null,

  check ((outcome_type = 'undecided') = (outcome_reason is not null))
);

create index responses_completed_on_idx on responses (completed_on);
create index responses_compared_with_idx on responses (compared_with) where compared_with is not null;

-- Research contacts ---------------------------------------------------------

create table research_contacts (
  id               bigint generated always as identity primary key,
  email            text not null check (char_length(email) between 3 and 254 and email like '%_@_%'),
  response_id      text not null references responses (id) on delete cascade,
  consent_version  text not null,
  created_on       date not null default current_date,
  withdrawn        boolean not null default false,
  unique (response_id, email)
);

-- Feedback -------------------------------------------------------------------

create table feedback (
  id               bigint generated always as identity primary key,
  type             text not null,
  item_ids         text[] not null default '{}',
  perspective_ids  text[] not null default '{}',
  versions         jsonb,
  body             text not null check (char_length(body) between 1 and 5000),
  evidence         text check (char_length(evidence) <= 2000),
  email            text check (char_length(email) between 3 and 254 and email like '%_@_%'),
  may_quote        boolean not null default false,
  response_id      text references responses (id) on delete set null,
  created_on       date not null default current_date
);

-- Locked down: RLS on, no policies, no grants to the Supabase API roles ------

alter table responses enable row level security;
alter table research_contacts enable row level security;
alter table feedback enable row level security;

revoke all on responses, research_contacts, feedback from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Totals views (section 6.3) -------------------------------------------------
-- Read in the Supabase dashboard. These are self-selected people who chose to
-- take the quiz; any public display must say so.

create view v_totals with (security_invoker = true) as
select
  count(*)                                                  as all_time,
  count(*) filter (where completed_on >= current_date - 6) as last_7_days,
  count(*) filter (where completed_on = current_date)      as today
from responses;

create view v_daily with (security_invoker = true) as
select completed_on, count(*) as completions
from responses
group by completed_on
order by completed_on desc;

create view v_outcomes with (security_invoker = true) as
select
  outcome_type,
  closest_perspective,
  count(*) as completions,
  round(count(*)::numeric / nullif(sum(count(*)) over (), 0), 4) as share
from responses
group by outcome_type, closest_perspective
order by completions desc;

-- Construct scores overall (country = 'all') and by country ('unknown' when D11 was skipped).
create view v_constructs with (security_invoker = true) as
with s as (
  select coalesce(r.country, 'unknown') as country, c.key as construct, (c.value ->> 'score')::numeric as score
  from responses r
  cross join lateral jsonb_each(r.result -> 'constructs') c
  where c.value ->> 'score' is not null
)
select
  coalesce(country, 'all') as country,
  construct,
  count(*)                       as n,
  round(avg(score), 3)           as mean,
  round(stddev_samp(score), 3)   as sd
from s
group by grouping sets ((construct), (country, construct))
order by country nulls first, construct;

-- Answer distribution per question. Values are JSON text: "4" for a 1..7 answer
-- or an option index, an object for trade-offs and grids. Free text (D9) is left out.
create view v_items with (security_invoker = true) as
select
  r.item_bank_version,
  a.key   as item,
  a.value::text as answer,
  count(*) as n
from responses r
cross join lateral jsonb_each(r.answers) a
where a.key <> 'D9'
group by r.item_bank_version, a.key, a.value::text
order by r.item_bank_version, a.key, a.value::text;

-- Skip rate per question, among responses on the same item bank version.
-- Questions nobody has answered yet do not appear.
create view v_skips with (security_invoker = true) as
with seen as (
  select distinct r.item_bank_version, a.key as item
  from responses r
  cross join lateral jsonb_object_keys(r.answers) a(key)
),
totals as (
  select item_bank_version, count(*) as responses
  from responses
  group by item_bank_version
)
select
  s.item_bank_version,
  s.item,
  t.responses,
  t.responses - count(r.id) filter (where r.answers ? s.item) as skipped,
  round(1 - count(r.id) filter (where r.answers ? s.item)::numeric / t.responses, 4) as skip_rate
from seen s
join totals t using (item_bank_version)
join responses r on r.item_bank_version = s.item_bank_version
group by s.item_bank_version, s.item, t.responses
order by skip_rate desc, s.item;

-- "Does this fit you?" by closest perspective, and quick-check ratings for
-- people's own perspective vs a different one.
create view v_fit with (security_invoker = true) as
select
  'fit'                         as measure,
  coalesce(closest_perspective, outcome_type) as perspective,
  count(fit_rating)             as n,
  round(avg(fit_rating), 2)     as mean_rating
from responses
group by coalesce(closest_perspective, outcome_type)
union all
select
  'quick_check_' || quick_check_shown as measure,
  quick_check_perspective       as perspective,
  count(quick_check_rating)     as n,
  round(avg(quick_check_rating), 2) as mean_rating
from responses
where quick_check_shown is not null
group by quick_check_shown, quick_check_perspective
order by measure, perspective;

-- Count only. Emails never appear in a view.
create view v_research_contacts with (security_invoker = true) as
select
  count(*)                              as total,
  count(*) filter (where not withdrawn) as active,
  count(*) filter (where withdrawn)     as withdrawn
from research_contacts;

revoke all on v_totals, v_daily, v_outcomes, v_constructs, v_items, v_skips, v_fit, v_research_contacts
  from anon, authenticated;
