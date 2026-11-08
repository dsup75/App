# Phase 2 — Money Source Link Foundation

## Scope

Phase 2 adds an isolated lineage data layer. It does not add a screen, alter a form, hook into the existing save RPC, modify allocations, or post account movements.

## New database structure

`money_source_links` stores a user-owned relationship from one existing money record to another:
- source and target table/id
- relation type
- linked amount in integer paise
- optional note
- created/updated/deleted timestamps

Both endpoints are validated against the existing supported money tables, must belong to the same user, and must be active. Row-level security follows the existing user-owned record-table setup. Active duplicate links are prevented.

This is a metadata/lineage table only. It has no trigger that writes to `payment_lines`, `allocations`, `account_movements`, or `account_balances`.

## New service

`src/lib/moneySourceLinks.ts` adds:
- create a source-to-target link
- list incoming source links for a target
- soft-delete a link
- traverse incoming links to build a money journey with cycle protection and a node limit

The service is intentionally separate from the existing `src/lib/moneyTools.ts`. That file currently queries a legacy `money_links` name and its unallocated summary aggregates link amounts alongside allocations and transfers. Creating a compatibility table under that name could change existing summary results, so this phase does not do that and does not modify that helper.

## Not included in Phase 2

- No automatic links during transaction save/edit.
- No UI picker or journey panel.
- No account reconciliation writes.
- No changes to account balances or existing reports.
- No deployment of this migration to the connected Supabase project.

## Verification required before any live use

The migration must be applied to a dedicated Supabase development branch and tested for RLS ownership, same-user endpoint validation, active-parent validation, duplicate prevention, and soft deletion before any production merge.
