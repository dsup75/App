# DeepBoost Life — Guide for any AI working on this repo

Read this whole file before changing anything.

## 1. What the app is
DeepBoost Life is one Android app (multi-user, every user sees only their own data) for:
- **Money**: incomes, expenses, transfers, udhaar (loans given/taken) + repayments, payment requests (UPI QR / link), invoices (PDF), group split, goals (savings), budgets, recurring entries, income → expense/udhaar/transfer links ("₹X left" of an income).
- **Study**: subjects, chapters (syllabus templates JEE / NEET / CBSE / UP Board / state), study sessions, focus timer (pomodoro), mock tests, exams.
- **Clients (business)**: clients, client staff (e.g. a client's staff who send payments), projects, campaigns, client tasks.
- **Daily life**: tasks, habits, events, calendar, notes, shopping list.
- **Other**: Home dashboard, reports + PDF/Excel/CSV export, Smart Add (text/screenshot → draft → approve), AI assistant (Gemini edge function), reminders (local notifications), photos & bills on any record, recycle bin, edit history, PIN / fingerprint lock, Google Sheet sync.

App UI language: **English**. Look: iOS-style "liquid glass" — transparent glassy cards, forest-green palette, small rounded buttons, dark + light mode. Built and used mainly on an **Android phone**.

## 2. Tech stack
- Vite + React 18 + TypeScript + Tailwind 3 (`src/`)
- Capacitor 6 Android (the `android/` folder is NOT in the repo — CI runs `npx cap add android` every build)
- Plugins: @capacitor/app, preferences, status-bar, share, filesystem, local-notifications, @aparajita/capacitor-biometric-auth
- Libraries: lucide-react 0.446 (icons), qrcode, jspdf + jspdf-autotable, xlsx, @fontsource-variable/inter
- Backend: **Supabase** (Postgres + Auth + RLS + Storage + Edge Functions). Project ref: `agmfanppiupeaqhsqlst`
- Google Sheet sync: `google-apps-script/Code.gs` (user deploys it as a Web App and pastes the URL in Settings). Sync is **one way: App → Sheet** (sheet tabs are replaced on every sync).

## 3. How code reaches the phone (very important)
1. Push to `main` on GitHub repo `dsup75/App`.
2. **Supabase GitHub integration** automatically applies any new file in `supabase/migrations/`.
3. **GitHub Actions** (`.github/workflows/build-apk.yml`) builds a signed release APK and publishes it on GitHub **Releases** (`v1.0.<run number>`). If the build fails, it opens a GitHub issue with the log.
4. The user downloads the APK from Releases and installs it.

There is no package-lock; CI runs `npm install --legacy-peer-deps`, then `vite build` (no `tsc` step — keep types correct anyway).

## 4. Database rules (must follow)
- **Never edit an old migration.** Add a new file: `supabase/migrations/YYYYMMDDHHMMSS_short_name.sql` with a timestamp later than the last one. Make it idempotent (`if not exists`, `drop … if exists`, `create or replace`).
- Every record table: `id uuid`, `user_id uuid default auth.uid()`, `created_at`, `updated_at`, `deleted_at` (soft delete), `unique (id, user_id)`, then `select public.setup_record_table('<table>');` (adds RLS, edit history, grants).
- Foreign keys are composite `(x_id, user_id)` so one user can never link another user's data.
- Linked-record-in-recycle-bin check: trigger `trg_links` using `public.check_parents_active('col:table', …)`.
- Error messages for the app: `raise exception 'APP_ERROR: <friendly text>'` (shown as-is by `friendlyError()` in `src/lib/db.ts`).
- Views use `with (security_invoker = true)`; grant select to `authenticated`, revoke from `anon`.
- Money is stored as **integer paise** (`*_paise` bigint). ₹1 = 100.
- New table that should be restorable → add it to the `recycle_bin` view (recreate the whole view in the new migration).
- After DB changes, check Supabase security advisors.

### Money model (payment breakdown)
- Parent tables: `incomes`, `expenses`, `loans`, `loan_repayments`, `transfers` = the *purpose* (title, category, client, mode, area, notes).
- `payment_lines` = the actual money parts: `parent_table, parent_id, direction in|out, account_id, amount_paise, payment_app, payment_method, txn_date, txn_time, reference (UTR), party_name (paid by / to), notes, sort`. One entry can have many lines (e.g. ₹2,000 Paytm + ₹3,000 GPay).
- **Account balance = opening_balance + Σ in lines − Σ out lines** (views `account_movements`, `account_balances`).
- Always save money entries through RPC **`save_money_entry(p_table, p_id, p_parent jsonb, p_lines jsonb, p_links jsonb)`** (frontend: `saveMoneyEntry()` in `src/lib/db.ts`). It writes parent + lines + income links in one transaction and sets parent `amount_paise`/`account_id`/date/`line_count`.
- Transfers: lines out must equal lines in. Repayments: principal = total − interest.
- `allocations` = income → (expense | loan | transfer) links. Views `income_usage` (spent / lent / moved / left) and `expense_funding`.
- Safety-net trigger `sync_default_lines` creates lines for rows written without the RPC (old app versions).

### Money sources, journey & tools (Nov 2026, additive)
- `money_links` (source → target, with `account_id` = the account the money left from). Older `allocations` still work; `all_money_links` view merges both.
- `source_moves` / `source_positions` views: where each source's money is now, per account. A transfer only carries money linked into it, so nothing is counted twice. Guard trigger `trg_money_link_account` blocks using money that isn't in that account.
- Save money-out entries with per-row links via RPC `save_money_entry_with_sources` (frontend `saveMoneyEntryWithSources` in `src/lib/moneyTools.ts`). Entries that already have old `allocations` keep the old combined section.
- `money_journey` / `money_origin` (journey), `reconciliations` + `reconciliation_adjustments` (never change balances), `transaction_history` view, `find_duplicate_candidates`, `entry_reversals` + `reverse_entry` (undo = new opposite entry), `checklist_items`, `ai_connection` (Edge Function URL only — never a key), `import_backup_rows` (backup import, adds missing rows only).
- The earlier Codex `money_source_links` idea (PR #1 notes in ADDITIVE_MONEY_PHASE*.md) was never applied to the database and is replaced by the `money_links` system above — do not bring it back.
- Native: `native/focus-guard` (local Capacitor plugin, Java) for focus mode; `native/health-connect` (local Capacitor plugin, Kotlin, read-only; `@capgo/capacitor-health` has no Capacitor 6 version) for Health Connect. CI runs `ci/patch-android.py` after `cap add android` (minSdk 26 + Health Connect manifest entries).

## 5. Frontend structure
- `src/lib/tables.ts` — **registry of every table** (fields, labels, types, defaults, validation). Generic screens use it: `RecordEdit` (form), `RecordDetail` (detail + edit history), `TableList` (list), `RecordLine` (row). Adding a simple module = migration + entry in `TABLES` + `TABLE_ICON` in `RecordLine.tsx` + a route/list screen.
- `src/components/RecordForm.tsx` — generic form; `MoneyForm.tsx` — money form (purpose card on top, "Payment breakdown" lines below, income links, split).
- `src/components/DetailExtras.tsx` — extra panels on detail pages (account statement, invoice PDF, loan summary, "where this income went"…).
- `src/lib/db.ts` — data helpers (`createRecord`, `updateRecord`, `softDelete`, `saveMoneyEntry`, `getLines`, `friendlyError`…).
- `src/lib/useLookups.ts` — cached accounts/categories/refs; `src/lib/options.ts` — user-editable dropdowns (Settings → Manage lists).
- `src/lib/sheets.ts` — what goes to Google Sheet (add new tables to `SHEETS`).
- `src/lib/reminders.ts`, `budgets.ts`, `recurring.ts`, `parse.ts` (Smart Add parsing), `syllabus.ts` (templates).
- Screens in `src/screens/`, routes in `src/App.tsx`, menu in `src/screens/More.tsx`, bottom tabs in `src/components/Shell.tsx`.
- UI kit in `src/components/ui.tsx` (Page, Card, HeroCard, List, ListRow, Button, Sheet, Confirm, Toggle, Chips, Segmented, KV, ProgressBar…). Reuse these and the CSS classes `glass`, `liquid`, `field`; colours are CSS variables in `src/index.css` (`--primary`, `--income`, `--expense`, `--danger`, `--card-2`, `--hairline`…). Keep buttons small, mobile-first, and test both themes.

## 6. Product rules (from the owner)
- Nothing is saved automatically from AI/Smart Add/recurring — always **draft → user approves**.
- Every delete is a soft delete into the Recycle Bin, except where clearly stated.
- Financial edits show a confirm step and are kept in edit history.
- Keep data of each client separate; never mix users.
- Prefer free tools; no paid services without asking.
- Do not invent data, numbers or results.

## 7. Secrets — never put these in code or chat
- Gemini key → Supabase Edge Function secret `GEMINI_API_KEY` (set in the Supabase dashboard).
- Only the Supabase **publishable/anon** key may be in the app.
- Do not change `ci/release.keystore` or its alias/password (changing it breaks updates of the installed app).

## 8. Before you push
1. Code compiles (no missing imports, correct types).
2. New migration tested if possible (idempotent, no data loss; for money changes, balances must stay the same).
3. Commit with a clear message, push to `main`.
4. Check: Supabase migration applied, GitHub Actions build green, new APK in Releases.
5. Tell the owner in simple Hinglish what changed and what to test on the phone.
