# DeepBoost Life

Ek Android app jo money, tasks, study aur clients ek jagah manage karti hai.
iOS-style liquid glass design, dark + light theme, multi-user (har user ka data alag).

**Stack:** React + TypeScript + Tailwind → Capacitor (Android APK) · Supabase (database + login + RLS) · GitHub Actions (auto APK).

---

## Phase 1 mein kya hai

- Email login / sign up / password reset (email code se)
- App lock: 4 ya 6 digit PIN, fingerprint, auto-lock timer, "Lock now", "Forgot PIN"
- Home dashboard: aaj ke tasks + progress ring, aaj ki income/expense, mahine ka summary, total balance, filters (All / Personal / Study / Business)
- Finance: income, expense, transfer, accounts (Cash/Bank/UPI/Wallet/Custom), categories, month-wise entries
- Har record pe: detail screen, edit, copy (duplicate), edit history (purani → nayi value), delete → Recycle Bin → restore / delete forever
- Paise se related edit pe pehle confirm screen (kya badlega)
- Tasks: Today / Upcoming / Open / Done, priority, area
- Settings: name, theme (Auto/Light/Dark), PIN & fingerprint, Google Sheet sync (Apps Script URL, sync key, Test, Save, Sync now, Disconnect), sign out

**Aage aayega:** Phase 2 (invoices, udhaar/loan, group split, savings, allocations) · Phase 3 (study, clients, habits, calendar) · Phase 4 (reports, PDF/Excel export, AI assistant).

---

## One-time setup (phone se)

### 1. Database banao (sirf ek baar)
1. GitHub app/browser mein is repo mein `supabase/migrations/0001_phase1.sql` kholo → **Raw** → poora text copy karo.
2. Supabase → apna project → **SQL Editor** → **New query** → paste → **Run**.
3. "Success" aana chahiye. (Dobara chalane se kuch nahi bigadta.)

### 2. Supabase Auth settings
1. **Authentication → Sign In / Providers → Email**:
   - Phase 1 ke liye **Confirm email = OFF** rakho (signup turant kaam karega).
2. **Authentication → Emails → Reset Password** template ki body mein ye line add karo:
   `Your reset code: {{ .Token }}`
   (App link nahi, code maangti hai.)
3. Note: Supabase ka free email sender ek ghante mein limited emails bhejta hai.

### 3. APK download karo
1. Har push pe GitHub khud APK banata hai (5–10 min).
2. Repo → **Actions** tab mein "Build APK" green ✅ hone tak ruko.
3. Repo → **Releases** → latest → `DeepBoost-Life.apk` download → install
   (pehli baar "Install unknown apps" allow karna padega).
4. Naye version ko purane ke upar install kar sakte ho, data safe rehta hai (data server pe hai).

### 4. Google Sheet sync (optional)
1. Naya Google Sheet → **Extensions → Apps Script**.
2. `google-apps-script/Code.gs` ka code paste karo → Save. (Chaho to `SYNC_KEY` mein ek secret word likho.)
3. **Deploy → New deployment → Web app** → Execute as: **Me**, Who has access: **Anyone** → Deploy → URL copy.
4. App → Settings → Google Sheet sync → URL (+ same sync key) → **Save** → **Sync now**.

Har user apni khud ki Sheet + script connect karta hai, isliye kisi ka data mix nahi hota.

---

## Security notes

- Har table pe **Row Level Security**: user sirf apna data dekh/badal sakta hai (local Postgres pe test kiya gaya).
- Record ka ID aur owner kabhi change nahi hota (database trigger).
- Edit history sirf database likhta hai, user use badal nahi sakta.
- Permanent delete sirf Recycle Bin wale records ka ho sakta hai.
- Paise integer paise mein store hote hain (no float errors).
- `src/config.ts` mein sirf **publishable/anon key** hai. Ye public hoti hai. **Secret / service_role key kabhi repo mein mat daalna.**
- PIN phone pe hash (PBKDF2) karke store hota hai. PIN sirf is phone pe app screen ko protect karta hai, server data aapke password + RLS se protected hai.
- APK abhi `ci/release.keystore` se sign hoti hai (personal use ke liye theek). Play Store launch se pehle naya private key GitHub secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`) mein daalenge.

## Folder structure

```
src/
  lib/          supabase, money (paise), dates, tables (field registry), db, lock, theme, sheets
  context/      Auth, Lock, Toast
  components/   ui (glass components), Shell (tab bar + quick add), RecordForm, PinPad, MoneyRow
  screens/      Auth, LockScreen, Home, Finance, Tasks, RecordDetail, RecordEdit, RecycleBin, Settings, More
supabase/migrations/   database SQL
google-apps-script/    Sheet sync script
.github/workflows/     APK build
```
