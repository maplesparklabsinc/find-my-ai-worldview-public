-- Result feedback (docs/01-product-spec.md 5.6 item 9, 6.1 and 6.3; issue #11):
-- which perspective fits better, the six "is this about right?" checks, and how
-- often each answer was changed with Back. No personal data.

alter table responses
  -- A perspective ID, 'none' ("None of these") or 'own_mix' ("My own mix"); only after a low fit rating.
  add column better_fit text check (better_fit ~ '^[a-z_]{1,40}$'),
  -- Construct ID -> 'about_right' | 'further_low' | 'further_high'.
  add column track_checks jsonb not null default '{}' check (jsonb_typeof(track_checks) = 'object'),
  -- Answer key -> number of times that answer was changed after going Back.
  add column answer_changes jsonb not null default '{}' check (jsonb_typeof(answer_changes) = 'object');

-- "Does this fit?" now by outcome as well as perspective.
drop view v_fit;
create view v_fit with (security_invoker = true) as
select
  'fit'                     as measure,
  outcome_type,
  closest_perspective       as perspective,
  count(fit_rating)         as n,
  round(avg(fit_rating), 2) as mean_rating
from responses
group by outcome_type, closest_perspective
union all
select
  'quick_check_' || quick_check_shown as measure,
  null                      as outcome_type,
  quick_check_perspective   as perspective,
  count(quick_check_rating) as n,
  round(avg(quick_check_rating), 2) as mean_rating
from responses
where quick_check_shown is not null
group by quick_check_shown, quick_check_perspective
order by measure, outcome_type, perspective;

-- Assigned perspective against the one people said fits better.
create view v_better_fit with (security_invoker = true) as
select
  outcome_type,
  closest_perspective as assigned,
  better_fit          as said_fits_better,
  count(*)            as n
from responses
where better_fit is not null
group by outcome_type, closest_perspective, better_fit
order by outcome_type, assigned, n desc;

-- For each question and band, how people judged their marker.
create view v_track_checks with (security_invoker = true) as
with c as (
  select
    t.key   as construct,
    r.result -> 'constructs' -> t.key ->> 'band' as band,
    t.value #>> '{}' as answer
  from responses r
  cross join lateral jsonb_each(r.track_checks) t
)
select
  construct,
  band,
  count(*) as n,
  round(count(*) filter (where answer = 'about_right')::numeric / count(*), 4)  as about_right,
  round(count(*) filter (where answer = 'further_low')::numeric / count(*), 4)  as further_low,
  round(count(*) filter (where answer = 'further_high')::numeric / count(*), 4) as further_high
from c
group by construct, band
order by construct, band;

-- How often each question's answer was changed with Back.
create view v_answer_changes with (security_invoker = true) as
select
  r.item_bank_version,
  a.key as item,
  count(*)                    as responses_with_changes,
  sum((a.value #>> '{}')::int) as total_changes
from responses r
cross join lateral jsonb_each(r.answer_changes) a
group by r.item_bank_version, a.key
order by total_changes desc, a.key;

revoke all on v_fit, v_better_fit, v_track_checks, v_answer_changes from anon, authenticated;
