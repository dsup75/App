-- How much of each income has been used (allocated to expenses) and how much
-- of each expense has been funded. Allocations never change balances — these
-- views only show where money went.

create or replace view public.income_usage with (security_invoker = true) as
select i.id, i.user_id, i.amount_paise,
  coalesce((select sum(a.amount_paise) from public.allocations a where a.income_id = i.id and a.deleted_at is null), 0)::bigint as used_paise,
  (i.amount_paise - coalesce((select sum(a.amount_paise) from public.allocations a where a.income_id = i.id and a.deleted_at is null), 0))::bigint as left_paise
from public.incomes i
where i.deleted_at is null;

create or replace view public.expense_funding with (security_invoker = true) as
select e.id, e.user_id, e.amount_paise,
  coalesce((select sum(a.amount_paise) from public.allocations a where a.expense_id = e.id and a.deleted_at is null), 0)::bigint as funded_paise
from public.expenses e
where e.deleted_at is null;

grant select on public.income_usage, public.expense_funding to authenticated;
revoke all on public.income_usage, public.expense_funding from anon;
