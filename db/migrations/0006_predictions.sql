-- The optional guess before the result (issue #24): after the last question,
-- people may say where they think their answers landed. It is stored with the
-- anonymous response for comparing expectation with result in aggregate, and
-- never affects scoring. Not personal data. Never shown on a result,
-- comparison or share image.
alter table responses
  -- 'skipped' means the person saw the question and chose not to guess; null
  -- means a response saved before the question existed.
  add column prediction_kind text
    check (prediction_kind in ('perspective', 'between', 'own_combination', 'forming', 'not_priority', 'skipped')),
  -- One perspective ID, or two different ones (sorted) for 'between'; null otherwise.
  add column prediction_perspectives text[],
  add constraint responses_prediction_check check (coalesce(
    case prediction_kind
      when 'perspective' then cardinality(prediction_perspectives) = 1
      when 'between' then cardinality(prediction_perspectives) = 2
        and prediction_perspectives[1] < prediction_perspectives[2]
      else prediction_perspectives is null
    end, false)
  );

-- Guess against result. Responses from before the question are left out.
create view v_predictions with (security_invoker = true) as
select
  prediction_kind,
  prediction_perspectives,
  outcome_type,
  outcome_reason,
  closest_perspective,
  case when outcome_type = 'mixed_between' then result -> 'outcome' -> 'ranked' -> 1 ->> 'id' end as second_perspective,
  count(*) as n
from responses
where prediction_kind is not null
group by 1, 2, 3, 4, 5, 6
order by prediction_kind, n desc;

revoke all on v_predictions from anon, authenticated;
