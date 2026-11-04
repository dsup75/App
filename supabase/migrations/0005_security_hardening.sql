-- =====================================================================
-- DeepBoost Life — 0005: security hardening (from Supabase advisors)
-- Fixed search_path on every function; trigger-only functions are not
-- callable through the API.
-- =====================================================================

alter function public.record_before_update() set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.tasks_completed_at() set search_path = public;
alter function public.check_links_active() set search_path = public;
alter function public.payment_requests_paid_at() set search_path = public;
alter function public.sync_request_status() set search_path = public;
alter function public.setup_record_table(text) set search_path = public;
alter function public.check_parents_active() set search_path = public;
alter function public.check_allocation() set search_path = public;
alter function public.check_group_expense() set search_path = public;
alter function public.mock_tests_score() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_edit_history() from public, anon, authenticated;
revoke execute on function public.setup_record_table(text) from public, anon, authenticated;
