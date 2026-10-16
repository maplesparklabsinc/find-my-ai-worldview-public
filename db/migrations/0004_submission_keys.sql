-- Saving the same quiz twice (issue #18). The browser sends a random key with
-- each completed quiz; only its SHA-256 hash is stored. A second save with the
-- same key returns the first result instead of adding a row, so a retry after a
-- lost response can never count a person twice. Not personal data: the key is
-- random and lives only in the tab's sessionStorage until the result is saved.
alter table responses
  add column submission_key_hash bytea unique check (octet_length(submission_key_hash) = 32);
