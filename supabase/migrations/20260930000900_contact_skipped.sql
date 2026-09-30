-- Phase 5 · Messages to test addresses (example.com: sample listings and test
-- accounts) are marked 'skipped' by the email job rather than sent.
alter table public.contact_requests drop constraint contact_requests_status_check;
alter table public.contact_requests add constraint contact_requests_status_check
  check (status in ('queued', 'sent', 'failed', 'blocked', 'skipped'));
