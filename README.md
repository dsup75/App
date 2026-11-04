# DeepBoost Life

Ek Android app jo money, tasks, study aur clients ek jagah manage karti hai.
iOS-style liquid glass design, dark + light theme, multi-user (har user ka data alag).

**Stack:** React + TypeScript + Tailwind → Capacitor (Android APK) · Supabase (database + login + RLS) · GitHub Actions (auto APK).

---

## Features

- **Login & security:** email login, multi-user (har user ka data alag, RLS), PIN 4/6 + fingerprint, auto-lock, password reset by email code
- **Home:** balance (hide/show), income/expense, aaj ke tasks + progress, habits, study time, exam countdown, pending payments, loan dues, 6-month spending chart, next 7 days
- **Finance:** income/expense/transfer, accounts + **multiple UPI apps** (GPay, PhonePe, Paytm… har ek ka apna UPI ID aur balance), categories, allocations (kis income se kaunsa kharcha)
- **Payments:** kisne pay kiya (client direct / staff / other), method, UTR; UPI payment requests with QR + share; invoices with partial payments, status (Draft/Sent/Partial/Paid/Overdue/Cancelled), PDF
- **Udhaar/Loans:** lent/borrowed, multiple repayments, simple interest, overdue/settled
- **Group split:** equal / amount / % / item-wise, multiple payers, who-owes-whom, settlements
- **Goals:** money goals with contributions & withdrawals, progress
- **Smart Add:** text likho ya payment screenshot daalo → draft → Approve → entry save (text bina AI ke; screenshot ke liye AI setup)
- **Payment details:** kis app se pay/receive (GPay, PhonePe…), time, payment link, Personal/Business mode, UTR
- **Syllabus templates:** JEE (PCM), NEET (PCB), CBSE, UP Board, other state boards — Class 11/12 (NCERT rationalised chapter names; official syllabus se check karein)
- **Study:** subjects (Physics/Chemistry/Maths default), chapters (status, revisions, weak, backlog), Pomodoro (sirf real focus time save), study sessions, mock tests (JEE marking, accuracy), exam countdown
- **Clients:** clients, projects, campaigns (Meta/Google…), client tasks, follow-ups, approvals, client-wise billing
- **Daily life:** tasks (priority, status, waiting for client), habits + morning/evening routine + streaks, events, notes, shopping list, unified calendar (month/week/day)
- **Reports:** daily → yearly / custom range, category, account, client, area, study; export **PDF / Excel / CSV**, full JSON backup
- **AI assistant:** aapke data se jawab; quick answers bina AI ke bhi kaam karte hain
- **Har record:** detail, edit, copy, edit history, Recycle Bin → restore / delete forever, linked records
- **Google Sheet sync** (optional), dark + light theme

## One-time setup (phone se)

### 1. Database banao
`supabase/migrations/` ki files **number ke order mein** chalao (0001 → 0002 → … → 0006):
1. GitHub pe file kholo → **Raw** → poora text copy karo.
2. Supabase → **SQL Editor** → **New query** → paste → **Run** → "Success" aana chahiye.
3. Agli file ke liye repeat karo. (Dobara chalane se kuch nahi bigadta.)

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

### 5. AI assistant (optional)
1. Free Gemini API key: aistudio.google.com → Get API key.
2. Supabase → **Edge Functions** → Deploy new function → **Via Editor** → name `assistant` → `supabase/functions/assistant/index.ts` ka code paste → Deploy.
3. Edge Functions → **Secrets** → `GEMINI_API_KEY` = aapki key. (Model badalna ho to `GEMINI_MODEL` secret.)
Key phone/app mein kabhi nahi jaati. Bina setup ke bhi quick questions aur typed Smart Add kaam karte hain. Screenshot se entry (Smart Add) bhi isi function se chalti hai — code update ho to function dobara paste karke Deploy karein.

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

## Known limitations
- Attachments (photo/bill upload) abhi nahi hain.
- Reminders/notifications abhi nahi hain (calendar mein dues dikhte hain).
- Fingerprint sirf Android app mein; browser mein PIN hi chalega.
- Supabase free email sender ki hourly limit hoti hai.

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
