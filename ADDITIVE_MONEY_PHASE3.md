# Phase 3 — Optional Universal Source Links

## User-facing additions

- Added a new optional "Money source links" section to the existing money-entry form.
- The picker can select any active income, expense, transfer, loan, or loan repayment as a source.
- Transfer entries are included as selectable sources; a transfer can therefore form a middle step in a manually recorded money journey.
- Multiple source links can be attached to one saved target record with a partial amount and optional note.
- The UI validates positive amounts, prevents linking a record to itself, prevents duplicate sources on the same target, and keeps the sum of source links within the target transaction amount and each source transaction amount.
- Existing source links load when editing a money record. Removing a saved link soft-deletes only the lineage row.
- The Money Tools journey now traverses both incoming and outgoing links, with a visited set and node limit to avoid cycles.
- Full JSON backup includes source-link rows when the optional table exists, and safely skips that one table while its migration is not installed.

## Safety and compatibility

- The existing income-allocation section, split-expense section, payment breakdown, and `save_money_entry()` call remain in place.
- New source links are saved only after the normal money entry save succeeds. If lineage persistence fails, the normal entry remains saved and the user sees a specific warning; the form does not report the entire transaction as unsaved.
- Source links write only to `money_source_links`. They do not write payment lines, allocations, or account movements and do not change balances.
- When the database migration is not installed, the new section shows a disabled informational message and normal transaction save continues unchanged.
- The legacy `money_links` query in the existing unallocated-money summary has deliberately not been redirected to the new table. That summary's historical calculation is therefore not changed by this phase.

## Database status

The migration remains in the isolated GitHub branch only. It has not been applied to the connected Supabase project or production. There is currently no separate Supabase development branch available to validate the migration. Creating one can incur hourly charges and requires explicit cost approval, so no branch or database has been created or modified.

Before enabling source links for real use, apply the migration to a separately approved development database and test RLS ownership, endpoint ownership, active-parent checks, duplicate prevention, soft deletion, and traversal with transfer chains.
