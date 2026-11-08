# Additive Money Features — Phase 1 Baseline

## Scope and safety boundary

This branch is isolated from `main`. Phase 1 records the current architecture and establishes repeatable checks only. It does not change transaction behavior, balance calculations, existing screens, navigation, database records, or the production APK workflow.

Reconciliation is approved as **non-posting**: it records the observed balance and explanation for comparison only. It must not create a payment line or change an account balance.

## Verified existing architecture

- `payment_lines` stores account-level movements for incomes, expenses, loans, loan repayments, and transfers. Amounts are integer paise.
- `save_money_entry()` is the existing atomic write path for a money entry, its payment lines, and optional income allocations.
- `allocations` currently represents income funding of expenses, loans, and transfers; it is not yet a universal source-lineage graph.
- `account_movements` and `account_balances` derive account balances from active payment lines. New lineage/reconciliation metadata must not enter these calculations.
- `income_usage` and `expense_funding` expose existing funding summaries.
- `edit_history` and soft-delete/recycle-bin support already exist and should be reused where suitable rather than replaced.
- `src/lib/moneyTools.ts` already contains client-side journey/unallocated helpers that query `money_links`; the inspected migration set does not yet define that table. This mismatch must be resolved additively before those helpers are relied upon.

## Phase 1 test baseline

The workflow `.github/workflows/additive-money-baseline.yml` runs only on `codex/additive-money-*` branches (or manual dispatch). It installs dependencies, runs the existing TypeScript check, and runs the existing production web build even if typecheck fails. It does not build or publish an APK.

Baseline result on commit `9bd91edf625973d9dce00bf75aec553eaf4f34f0`:

- Dependency installation: passed.
- `npm run typecheck`: failed on pre-existing errors in `DetailExtras.tsx`, `Finance.tsx`, `Home.tsx`, `Lists.tsx`, `Reports.tsx`, `Requests.tsx`, and missing `qrcode` type declarations in `src/lib/upi.ts`.
- `npm run build`: passed.

These errors were not introduced or fixed in this phase. They are baseline findings and must remain separate from additive feature work.

## Guardrails for later phases

1. Add new schema and services without altering the existing `save_money_entry()` contract unless a separately reviewed compatibility plan proves it necessary.
2. Keep lineage links informational; they must not create duplicate account movements.
3. Keep reconciliation records non-posting and outside balance views.
4. Preserve integer-paise arithmetic and user-scoped row security.
5. Add optional UI entry points only after the isolated data/service layer is tested.
6. Stop and request review if an implementation requires changing an existing component's behavior or balance calculation.
7. Do not merge this branch into `main` without a separate review and explicit approval.
