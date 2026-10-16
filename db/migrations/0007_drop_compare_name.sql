-- No first names (issue #37 follow-up): sharing a result no longer asks for
-- one, and nothing shows one, so the column goes. Only test data had names.
alter table responses drop column compare_name;
