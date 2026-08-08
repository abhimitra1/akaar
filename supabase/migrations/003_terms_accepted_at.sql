-- Adds the terms-acceptance gate: every authenticated route now redirects to
-- /accept-terms (ProfileGate.jsx) until profiles.terms_accepted_at is set. NULL on every
-- existing row after this runs, by design — retroactively requires acceptance from
-- everyone, same as a real ToS update would.
--
-- ⚠️ Run this before deploying the frontend change that added the /accept-terms gate —
-- without this column, AcceptTermsPage.jsx's submit will error (column doesn't exist),
-- and every signed-in user gets stuck unable to pass the gate at all.
-- Depends on: nothing (profiles already exists from schema.sql).

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;
