# מדריך תפעול — Hakikat CRM

מדריך זה מיועד למתפעל המערכת (operations / ops). הוא מכסה את ההגדרה הראשונית, משתני סביבה, runbooks תפעוליים, פריסה, ותחזוקה שוטפת.

---

## תוכן

1. [הגדרה ראשונית](#setup)
2. [משתני סביבה](#env-vars)
3. [Migrations](#migrations)
4. [Background jobs (pg-boss)](#jobs)
5. [Cron schedule](#cron)
6. [Runbooks תפעוליים](#runbooks)
7. [פריסה](#deployment)
8. [Troubleshooting](#troubleshooting)
9. [אינטגרציות — איך מקבלים מפתחות](#integrations)

---

<a id="setup"></a>
## 1. הגדרה ראשונית

### א. Supabase
1. צור פרויקט ב־[supabase.com](https://supabase.com).
2. ב־**Project Settings → Database** העתק:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Connection string (Direct, port 5432)** → `DATABASE_URL` ⚠️ לא ה־pooled, pg-boss דורש LISTEN/NOTIFY שלא עובד מול pgbouncer.
3. **SQL Editor** → הרץ כל קובץ מ־[supabase/migrations/](../supabase/migrations/) לפי הסדר (001 → 005).

### ב. Anthropic Claude
- צור API key ב־[console.anthropic.com](https://console.anthropic.com) → `ANTHROPIC_API_KEY` (גם `CLAUDE_API_KEY` נתמך).

### ג. CRON_SECRET
- ייצר מחרוזת רנדומלית (32+ תווים): `openssl rand -hex 32` → `CRON_SECRET`.
- כל cron endpoints (`/api/notifications/check`, `/api/reports/whatsapp`, וכו׳) מוגנים ב־`Authorization: Bearer $CRON_SECRET`.

### ד. אינטגרציות אופציונליות
ראה [סעיף 9](#integrations) לפי המודולים שאתה מפעיל.

---

<a id="env-vars"></a>
## 2. משתני סביבה — רשימה מלאה

### ליבה (חובה)

| Variable | תיאור |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL של פרויקט Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | מפתח anon של Supabase (client) |
| `DATABASE_URL` | חיבור ישיר ל־Postgres (port 5432) — נדרש ל־pg-boss |
| `ANTHROPIC_API_KEY` | מפתח Claude (alias: `CLAUDE_API_KEY`) |
| `CRON_SECRET` | טוקן Bearer להגנה על endpoint-ים של cron |

### WhatsApp (WATI)

| Variable | תיאור |
|----------|-------|
| `WATI_API_KEY` | מפתח WATI |
| `WATI_BASE_URL` | URL של WATI tenant (לדוגמה: `https://app-server.wati.io/api/v1`) |
| `WATI_WEBHOOK_TOKEN` | טוקן לאימות webhooks נכנסים מ־WATI |
| `ADMIN_WHATSAPP_PHONE` | מספר WhatsApp של מנהל המערכת לדוחות שבועיים/חודשיים (E.164, לדוגמה `+972501234567`) |

### חשבוניות וקבלות

| Variable | תיאור |
|----------|-------|
| `MORNING_API_KEY` | Morning (Green Invoice) |
| `MORNING_API_SECRET` | Morning secret |
| `MORNING_BASE_URL` | ברירת מחדל: `https://api.greeninvoice.co.il/api/v1` |
| `ICOUNT_COMPANY_ID` | iCount company ID (חלופה ל־Morning) |
| `ICOUNT_USER` | iCount login |
| `ICOUNT_PASS` | iCount password |

### חתימה דיגיטלית (EasyDo)

| Variable | תיאור |
|----------|-------|
| `EASYDO_API_KEY` | מפתח EasyDo |
| `EASYDO_WEBHOOK_SECRET` | סוד לאימות webhooks של אירועי חתימה |

### Google Drive (גיבויים + חוזים)

| Variable | תיאור |
|----------|-------|
| `GOOGLE_CLIENT_ID` | OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth2 client secret |
| `GOOGLE_REFRESH_TOKEN` | refresh token |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | תיקייה לחוזים/קבלות |
| `GOOGLE_DRIVE_BACKUP_FOLDER_ID` | תיקייה לגיבוי שבועי |

### OneDrive (חלופה)

| Variable | תיאור |
|----------|-------|
| `NEXT_PUBLIC_ONEDRIVE_CLIENT_ID` | client ID של OneDrive — PKCE OAuth מצד לקוח (אין secret בצד שרת) |

### ערוצים נוספים

| Variable | תיאור |
|----------|-------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot |
| `TWILIO_ACCOUNT_SID` | Twilio (SMS) |
| `TWILIO_AUTH_TOKEN` | Twilio auth |
| `TWILIO_FROM_NUMBER` | מספר השולח |
| `RESEND_API_KEY` | Resend (Email) |
| `RESEND_FROM_EMAIL` | כתובת השולח |
| `ADMIN_EMAIL` | אימייל מנהל לאלרטים |
| `ADMIN_SMS_PHONE` | טלפון מנהל ל־SMS |
| `NEXT_PUBLIC_APP_URL` | URL ציבורי של האפליקציה (לקישורים ב־OAuth/הודעות) |

---

<a id="migrations"></a>
## 3. Migrations

| קובץ | מה הוא מוסיף |
|------|--------------|
| `001_initial_schema.sql` | טבלאות ליבה: legal_entities, complexes, properties, units, tenants, contracts, payment_schedule, payments, checks, invoices, projects, suppliers, project_expenses, action_logs, notifications, settings |
| `002_pending_actions.sql` | `pending_actions` — תור אישורי WhatsApp (yes/no) לפני ביצוע פעולה |
| `003_transactions_and_alerts.sql` | RPCs: `record_payment_tx`, helpers להתראות; `idempotency_key` ב־pending_actions |
| `004_features_2_10.sql` | `reliability_score` לדיירים, שרשרת חידוש חוזה, bouncing checks, drive_backups |
| `005_property_suggested_rent_and_notifications.sql` | `suggested_rent` ב־properties, מעקב delivery לכל ערוץ ב־notifications + `notification_attempts`, indices לספקים |

**להרצה:** SQL Editor ב־Supabase → העתק/הדבק כל קובץ לפי הסדר. אם הוספת migration חדש, וודא שהוא idempotent (`IF NOT EXISTS`).

---

<a id="jobs"></a>
## 4. Background jobs (pg-boss)

ה־worker מופעל אוטומטית מ־[src/instrumentation.ts](../src/instrumentation.ts) כשרצים ב־Node runtime. ב־Edge הוא לא ירוץ — חשוב לוודא שה־host (Vercel/Render) רץ ב־Node.

| Job | Handler | מה הוא עושה |
|-----|---------|--------------|
| `daily-alerts` | [daily-alerts.ts](../src/lib/worker/jobs/daily-alerts.ts) | סורק חוזים שפגים בעוד 45 יום, תשלומים בפיגור, צ׳קים חוזרים — שולח התראות |
| `whatsapp-weekly-report` | [whatsapp-reports.ts](../src/lib/worker/jobs/whatsapp-reports.ts) | דוח שבועי למנהל ב־WhatsApp |
| `whatsapp-monthly-report` | [whatsapp-reports.ts](../src/lib/worker/jobs/whatsapp-reports.ts) | דוח חודשי |
| `reliability-recompute` | [reliability-recompute.ts](../src/lib/worker/jobs/reliability-recompute.ts) | חישוב מחדש של ציון אמינות לדיירים |
| `drive-backup` | [drive-backup.ts](../src/lib/worker/jobs/drive-backup.ts) | גיבוי טבלאות ל־CSV ב־Google Drive |
| `notification-retry` | [notification-retry.ts](../src/lib/worker/jobs/notification-retry.ts) | retry להודעות שנכשלו (עד 5 ניסיונות) |

**הפעלה ידנית של job:** קרא ל־endpoint התואם עם `Authorization: Bearer $CRON_SECRET` (ראה סעיף הבא).

---

<a id="cron"></a>
## 5. Cron schedule (vercel.json)

| Endpoint | Cron | UTC | מה רץ |
|----------|------|-----|-------|
| `/api/notifications/check` | `0 6 * * *` | 06:00 כל יום | התראות יומיות |
| `/api/reliability/recompute` | `30 0 * * *` | 00:30 כל יום | ציון אמינות |
| `/api/reports/whatsapp?kind=weekly` | `15 6 * * 0` | ראשון 06:15 | דוח שבועי |
| `/api/reports/whatsapp?kind=monthly` | `30 6 1 * *` | 1 בחודש 06:30 | דוח חודשי |
| `/api/backup/drive` | `0 1 * * 0` | ראשון 01:00 | גיבוי Drive |

> ⚠️ Vercel cron הוא ב־UTC. שעון ישראל = UTC+2/+3. עדכן את ה־schedule אם רוצים זמן ישראלי מדויק.

הפעלה ידנית:
```bash
curl -X GET "https://<your-app>/api/notifications/check" \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

<a id="runbooks"></a>
## 6. Runbooks תפעוליים

### 🔴 דייר חתם על חוזה דיגיטלי אבל אין פעולה במערכת

1. בדוק שה־webhook של EasyDo רשום נכון: `https://<your-app>/api/webhooks/easydo`.
2. ודא ש־`EASYDO_WEBHOOK_SECRET` תואם בין EasyDo לבין משתני הסביבה.
3. בדוק `action_logs` ב־DB:
   ```sql
   SELECT * FROM action_logs
   WHERE entity_type='contract' AND action LIKE '%signature%'
   ORDER BY created_at DESC LIMIT 20;
   ```
4. אם ה־webhook הגיע אבל לא התעדכן status — ראה לוגים של [src/app/api/webhooks/easydo/route.ts](../src/app/api/webhooks/easydo/route.ts).

### 🔴 הודעות WhatsApp לא יוצאות

1. בדוק `notifications` עם `delivery_status='failed'`:
   ```sql
   SELECT id, channel, recipient, last_error, retry_count
   FROM notifications WHERE delivery_status='failed' ORDER BY failed_at DESC LIMIT 50;
   ```
2. ה־retry שעובד אוטומטית עד 5 פעמים. אם נשארים failed:
   - בדוק שמספר WATI חי ושהטמפלייט מאושר.
   - בדוק ש־`WATI_API_KEY` בתוקף.
3. הפעלה ידנית של retry: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/notifications/check`.

### 🔴 צ׳ק שנסרק לא נקשר לדייר

1. בדוק `checks` שנוצרו אבל אין להם `tenant_id`:
   ```sql
   SELECT id, check_number, amount, due_date FROM checks
   WHERE tenant_id IS NULL ORDER BY created_at DESC;
   ```
2. ה־OCR החזיר ת״ז שלא תואמת לאף דייר → קישור ידני ב־UI (`/checks`).
3. אם זה חוזר — בדוק ב־[src/app/api/checks/scan/route.ts](../src/app/api/checks/scan/route.ts) את ה־prompt ל־Claude Vision.

### 🟡 Worker לא מתחיל

1. ודא ש־`DATABASE_URL` הוא חיבור ישיר (port 5432), לא pgbouncer (6543).
2. בדוק לוגים — `instrumentation.ts` מדפיס `[worker] starting...` ב־cold start.
3. אם רץ ב־Edge runtime, ה־worker לא ירוץ. וודא שאתה ב־Node.

### 🟡 גיבוי Drive נכשל

1. רענן את `GOOGLE_REFRESH_TOKEN` (refresh tokens עלולים לפוג).
2. ודא שה־service account עם הרשאת write ל־`GOOGLE_DRIVE_BACKUP_FOLDER_ID`.
3. הפעל ידנית: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/backup/drive`.

### 🟢 הוספת מחיר שכירות מוצע לנכס
1. נכנס ל־`/properties`.
2. ערוך את הנכס → שדה "מחיר שכירות מוצע (₪)".
3. השדה מוצג בעץ הנכסים ובחזרה ל־DB ב־`properties.suggested_rent`.

### 🟢 רישום תשלום ידני
1. `/payments` → "תשלום חדש".
2. בחר דייר → שורת payment_schedule רלוונטית → סכום + שיטה.
3. הקלקה על "הנפק קבלה" יוצרת קבלה ב־Morning/iCount ושולחת ל־WhatsApp/אימייל.

### 🟢 יצירת חוזה חדש (AI)
1. `/contracts/new` → wizard ב־5 שלבים.
2. שלב 4: Claude מייצר טקסט בהתבסס על השדות. עריכה ידנית אפשרית.
3. שלב 5: שליחה ל־EasyDo לחתימה. PDF החתום נשמר אוטומטית ב־Drive עם קבלת ה־webhook.

---

<a id="deployment"></a>
## 7. פריסה

### Vercel (מומלץ ל־UI + cron)
1. חבר את הריפו ב־Vercel.
2. הוסף את כל משתני הסביבה (Environment Variables) ל־Production + Preview.
3. ה־cron מוגדרים אוטומטית מ־[vercel.json](../vercel.json).
4. ⚠️ **חשוב:** Vercel functions רצות עם cold start — ה־pg-boss worker יתחיל מחדש בכל invocation. ל־jobs ארוכים השתמש ב־Render.

### Render (מומלץ ל־worker מתמשך)
1. New Web Service → חבר את הריפו.
2. ה־[render.yaml](../render.yaml) מגדיר build/start אוטומטית.
3. הוסף משתני סביבה ב־Render dashboard.
4. ה־worker רץ ברציפות (אין cold start).

### היברידי
- Vercel ל־UI + cron HTTP endpoints.
- Render ל־worker מתמשך (notification retry, polling).

---

<a id="troubleshooting"></a>
## 8. Troubleshooting כללי

| תסמין | פעולה |
|-------|-------|
| Build נכשל ב־Vercel | בדוק ש־`NEXT_PUBLIC_*` מוגדרים — נדרשים ב־build time |
| `Could not connect to database` | `DATABASE_URL` שגוי או pooled — חייב להיות port 5432 |
| `Unauthorized` ב־cron endpoint | חסר/שגוי `CRON_SECRET` |
| AI agent לא עונה | בדוק `ANTHROPIC_API_KEY` ושיש credit; בדוק לוגים של `/api/ai-agent` |
| Webhook 401 | `*_WEBHOOK_SECRET` לא תואם בין צד שלישי לסביבה |
| Hebrew נשבר ב־PDF | בעיה ב־font — בדוק ש־Heebo נטען ב־[src/app/layout.tsx](../src/app/layout.tsx) |

לוגים: Vercel Functions → Logs / Render → Logs. ב־DB:
```sql
SELECT * FROM action_logs ORDER BY created_at DESC LIMIT 100;
SELECT * FROM notifications WHERE delivery_status='failed' ORDER BY failed_at DESC LIMIT 50;
```

---

<a id="integrations"></a>
## 9. אינטגרציות — איך מקבלים מפתחות

### Anthropic (Claude)
[console.anthropic.com](https://console.anthropic.com) → API Keys → Create.

### WATI
חשבון WATI → Settings → API → גם API key וגם base URL מוצגים שם. Webhook token ניתן להגדרה ב־Integrations → Webhooks.

### Morning (Green Invoice)
[app.greeninvoice.co.il](https://app.greeninvoice.co.il) → הגדרות → API → צור מפתח חדש (key + secret).

### EasyDo
[easydo.io](https://easydo.io) → Settings → API → צור API key. ה־webhook secret מוגדר עם רישום ה־webhook.

### Google Drive
1. [console.cloud.google.com](https://console.cloud.google.com) → New Project.
2. Enable Google Drive API.
3. OAuth consent screen → External.
4. Credentials → OAuth 2.0 Client (Web application).
5. צור refresh token דרך flow חד־פעמי (לדוגמה [oauth2 playground](https://developers.google.com/oauthplayground/) עם scope `https://www.googleapis.com/auth/drive`).

### OneDrive
[portal.azure.com](https://portal.azure.com) → App registrations → New registration → SPA → הוסף redirect URI של האפליקציה. Client ID בלבד נדרש (PKCE).

### Telegram
@BotFather בטלגרם → `/newbot` → קבל token.

### Twilio / Resend
חשבונות סטנדרטיים, מפתחות מה־dashboard.

---

## גרסאות

מסמך זה מתעדכן עם כל שינוי משמעותי בסכמה, jobs, או אינטגרציות. ראה [git log](../.git) להיסטוריה.
