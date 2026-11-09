-- ADDITIVE ONLY. Tracks which member paid their share of which subscription cycle.
alter table public.group_settlements add column if not exists recurring_rule_id uuid;
alter table public.group_settlements add column if not exists due_for date;
create index if not exists group_settlements_rule_cycle on public.group_settlements (user_id, recurring_rule_id, due_for) where deleted_at is null;
