-- Scoring 0.3.0 and feedback attachments (issue #21).
--
-- A new "Still forming" reason: every scored question sits in the middle band.
alter table responses drop constraint responses_outcome_reason_check;
alter table responses add constraint responses_outcome_reason_check
  check (outcome_reason in ('coverage', 'confidence', 'middle'));

-- Anyone with a result link can attach it to feedback, so the admin page needs
-- to know whether the attachment came from the browser that saved the result.
-- Set when the feedback is sent: true only if the request carried that result's
-- edit token. Earlier rows are unknown and count as unverified.
alter table feedback add column attached_verified boolean not null default false;
