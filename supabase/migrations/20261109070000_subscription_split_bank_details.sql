-- ADDITIVE ONLY. New nullable columns + one trigger. Existing rows, balances and formulas are unchanged.

-- ---------- 1. Subscriptions shared with a split group ----------
alter table public.recurring_rules add column if not exists split_group_id uuid;
alter table public.recurring_rules add column if not exists start_date date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'recurring_rules_split_group_fk') then
    alter table public.recurring_rules add constraint recurring_rules_split_group_fk
      foreign key (split_group_id, user_id) references public.groups (id, user_id);
  end if;
end $$;

-- one group bill per subscription cycle (no duplicates)
alter table public.group_expenses add column if not exists recurring_rule_id uuid;
alter table public.group_expenses add column if not exists due_for date;
alter table public.group_expenses add column if not exists expense_id uuid;
create unique index if not exists group_expenses_recurring_once
  on public.group_expenses (recurring_rule_id, due_for) where deleted_at is null and recurring_rule_id is not null;

-- When a subscription payment is logged (expense with recurring_rule_id), and the subscription
-- has a split group, add the bill to that group: paid by "me", shared equally by all members.
create or replace function public.split_subscription_payment()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_group uuid; v_title text; v_me uuid; v_members uuid[]; v_n integer; v_each bigint; v_rest bigint; v_shares jsonb := '[]'::jsonb; i integer;
begin
  if new.recurring_rule_id is null or new.deleted_at is not null then return new; end if;
  select split_group_id, title into v_group, v_title from public.recurring_rules
   where id = new.recurring_rule_id and user_id = new.user_id;
  if v_group is null then return new; end if;
  if exists (select 1 from public.group_expenses where user_id = new.user_id and recurring_rule_id = new.recurring_rule_id
              and due_for is not distinct from coalesce(new.due_for, new.txn_date) and deleted_at is null) then
    return new;
  end if;
  select id into v_me from public.group_members where group_id = v_group and user_id = new.user_id and is_me and deleted_at is null limit 1;
  select array_agg(id order by created_at) into v_members from public.group_members where group_id = v_group and user_id = new.user_id and deleted_at is null;
  v_n := coalesce(cardinality(v_members), 0);
  if v_me is null or v_n < 2 or coalesce(new.amount_paise, 0) <= 0 then return new; end if;
  v_each := new.amount_paise / v_n;
  v_rest := new.amount_paise - v_each * v_n;
  for i in 1..v_n loop
    v_shares := v_shares || jsonb_build_object('member_id', v_members[i], 'amount_paise', v_each + case when i = 1 then v_rest else 0 end);
  end loop;
  insert into public.group_expenses (user_id, group_id, title, amount_paise, txn_date, split_type, payers, shares, notes, recurring_rule_id, due_for, expense_id)
  values (new.user_id, v_group, left(coalesce(v_title, new.title, 'Subscription'), 120), new.amount_paise, new.txn_date, 'equal',
          jsonb_build_array(jsonb_build_object('member_id', v_me, 'amount_paise', new.amount_paise)), v_shares,
          'Added automatically from the subscription payment', new.recurring_rule_id, coalesce(new.due_for, new.txn_date), new.id)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_split_subscription on public.expenses;
create trigger trg_split_subscription after insert or update of amount_paise, recurring_rule_id on public.expenses
  for each row execute function public.split_subscription_payment();

-- ---------- 2. Bank account details (never PIN / CVV / OTP / passwords) ----------
alter table public.accounts add column if not exists account_number text check (account_number is null or account_number ~ '^[0-9A-Za-z -]{4,34}$');
alter table public.accounts add column if not exists ifsc text check (ifsc is null or ifsc ~ '^[A-Za-z]{4}0[A-Za-z0-9]{6}$');
alter table public.accounts add column if not exists customer_id text check (customer_id is null or char_length(customer_id) <= 30);
alter table public.accounts add column if not exists branch text check (branch is null or char_length(branch) <= 200);
alter table public.accounts add column if not exists account_holder text check (account_holder is null or char_length(account_holder) <= 80);
alter table public.accounts add column if not exists bank_account_type text check (bank_account_type is null or bank_account_type in ('savings', 'current', 'salary', 'jan_dhan', 'basic', 'nre', 'nro', 'other'));
alter table public.accounts add column if not exists card_network text check (card_network is null or card_network in ('rupay', 'visa', 'mastercard'));
alter table public.accounts add column if not exists card_color text check (card_color is null or card_color ~ '^#[0-9A-Fa-f]{6}$');
