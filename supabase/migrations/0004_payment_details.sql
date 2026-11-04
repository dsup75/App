-- =====================================================================
-- DeepBoost Life — 0004: payment app, time, link, mode (personal/business)
-- Run in Supabase → SQL Editor AFTER 0001–0003. Safe to run twice.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['incomes', 'expenses'] loop
    execute format('alter table public.%I add column if not exists payment_app text', t);
    execute format('alter table public.%I add column if not exists txn_time time', t);
    execute format('alter table public.%I add column if not exists payment_link text', t);
    execute format('alter table public.%I add column if not exists payment_mode text not null default ''personal''', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_payment_app_check');
    execute format($f$alter table public.%I add constraint %I check (payment_app is null or payment_app in
      ('gpay','phonepe','paytm','bhim','amazonpay','cred','bank_app','netbanking','card','cash','other'))$f$, t, t || '_payment_app_check');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_payment_mode_check');
    execute format($f$alter table public.%I add constraint %I check (payment_mode in ('personal','business'))$f$, t, t || '_payment_mode_check');
  end loop;
end $$;

-- Expenses also get method + reference (incomes already have them)
alter table public.expenses add column if not exists payment_method text;
alter table public.expenses add column if not exists reference text;
alter table public.expenses drop constraint if exists expenses_payment_method_check;
alter table public.expenses add constraint expenses_payment_method_check
  check (payment_method is null or payment_method in ('upi', 'bank', 'cash', 'payment_link', 'card', 'cheque', 'other'));

alter table public.transfers add column if not exists txn_time time;

-- Existing business entries become "business" payment mode
update public.incomes set payment_mode = 'business' where area = 'business' and payment_mode = 'personal';
update public.expenses set payment_mode = 'business' where area = 'business' and payment_mode = 'personal';

-- More UPI-app style choices on accounts
alter table public.accounts drop constraint if exists accounts_upi_app_check;
alter table public.accounts add constraint accounts_upi_app_check
  check (upi_app is null or upi_app in ('gpay','phonepe','paytm','bhim','amazonpay','cred','bank_app','netbanking','card','cash','other'));
