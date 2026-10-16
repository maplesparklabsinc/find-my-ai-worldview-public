-- Ownership of a saved result. POST /api/responses returns a random edit token
-- once and stores only its SHA-256 hash. Every change to a response (result
-- feedback, compare name) and every research contact for it needs the token.
-- Responses saved before this migration have no hash and can't be changed.
alter table responses add column edit_token_hash bytea check (octet_length(edit_token_hash) = 32);
