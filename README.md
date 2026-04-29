# Hakikat CRM

CRM לניהול נדל״ן בעברית (RTL) — דיירים, חוזים, תשלומים, סריקת צ׳קים, פרויקטים יזמיים, התראות וסוכן AI ב־WhatsApp.

הפרויקט בנוי על **Next.js 16** (App Router) + **Supabase** (Postgres) + **pg-boss** (jobs) + **Anthropic Claude** (AI), עם אינטגרציות ל־WATI, Morning/Green Invoice, iCount, EasyDo, Google Drive, OneDrive, Telegram, Twilio ו־Resend.

> ⚠️ **גרסת Next.js**: זוהי Next.js 16 — חלק מה־APIs שונים מהגרסאות שאתה מכיר. ראה [AGENTS.md](AGENTS.md) ו־`node_modules/next/dist/docs/` לפני כתיבת קוד.

---

## תוצרי המוצר

| מודול | מה הוא עושה |
|-------|-------------|
| **חוזים + AI** | Claude מייצר חוזה מלא מפרטי דייר קיים, עריכה ידנית, חתימה דיגיטלית דרך EasyDo, גיבוי ל־Drive/OneDrive |
| **סריקת צ׳קים** | Claude Vision מחלץ פרטי צ׳ק מתמונה (אתר/WhatsApp), מזהה דייר, מנפיק קבלה, מסנכרן תשלום |
| **פרויקטים** | CRUD מלא + ניהול ספקים + הוצאות מול תקציב + עדכוני סטטוס ב־WhatsApp |
| **נכסים** | ישויות → מתחמים → נכסים → יחידות, מפת תפוסה, שכ״ד מוצע לכל נכס |
| **תשלומים** | לוח אוטומטי מהחוזה, סנכרון עם צ׳קים, מעקב פיגורים, צ׳ק חוזר, יתרה פתוחה |
| **התראות** | Daily/weekly/monthly דרך WhatsApp/SMS/Email + push, retry אוטומטי |
| **AI Agent** | סוכן שמקבל פקודות בעברית ב־WhatsApp/Telegram, מבצע פעולות (יצירת חוזה, רישום הוצאה וכו׳) |

---

## דרישות מקדימות

- **Node.js 20+**
- **חשבון Supabase** עם Postgres נגיש (חובה `DATABASE_URL` ישיר ל־port 5432, לא pooled — נדרש ל־pg-boss)
- **Anthropic API key** (Claude Sonnet — ל־AI agent וסריקת צ׳קים)
- אינטגרציות אופציונליות לפי הצורך (ראה [docs/OPERATIONS.md](docs/OPERATIONS.md))

---

## התקנה והרצה לוקאלית

```bash
git clone <repo-url>
cd hakikat-crm
npm install

# הפעלת migrations מול Supabase
# (העתק כל קובץ מ־supabase/migrations/ והרץ ב־SQL editor של Supabase, לפי הסדר)

cp .env.example .env.local   # אם אין קובץ — צור לפי טבלת ה־env vars למטה
npm run dev
```

האפליקציה תרוץ ב־`http://localhost:3000`.

### Scripts

| Command | מה זה עושה |
|---------|------------|
| `npm run dev` | שרת פיתוח (Next.js + worker אוטומטי דרך `instrumentation.ts`) |
| `npm run build` | בילד פרודקשן |
| `npm run start` | הרצת build |
| `npm run lint` | ESLint |

---

## משתני סביבה

ראה [docs/OPERATIONS.md#env-vars](docs/OPERATIONS.md) לרשימה מלאה. החובה המינימלית להרצה:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
DATABASE_URL=postgres://...     # ישיר, לא pooled
ANTHROPIC_API_KEY=sk-ant-...
CRON_SECRET=<random-string>
```

כל שאר המפתחות (WATI, Morning, EasyDo, Google Drive, Telegram וכו׳) הם אופציונליים — מודולים ללא מפתחות יראו הודעות UI מתאימות אך לא יקרסו.

---

## ארכיטקטורה (high level)

```
┌─────────────────┐   ┌──────────────────┐   ┌─────────────────┐
│  Next.js (App)  │   │   Supabase (DB)  │   │   pg-boss jobs  │
│  RTL React UI   │←→ │   Postgres + RLS │←→ │ (LISTEN/NOTIFY) │
└────────┬────────┘   └──────────────────┘   └────────┬────────┘
         │                                            │
         ↓                                            ↓
   API routes (src/app/api/**)              cron triggers
         │                                            │
         ↓                                            ↓
┌──────────────────────────────────────────────────────────┐
│ Integrations: Claude · WATI · Morning · EasyDo · Drive · │
│ OneDrive · iCount · Telegram · Twilio · Resend           │
└──────────────────────────────────────────────────────────┘
```

- **UI**: Next.js App Router, React Query, Tailwind v4, Hebrew RTL.
- **DB**: Supabase Postgres, מיגרציות תחת [supabase/migrations/](supabase/migrations/).
- **Worker**: pg-boss מופעל אוטומטית דרך [src/instrumentation.ts](src/instrumentation.ts) כשרצים ב־Node runtime.
- **Cron**: מוגדר ב־[vercel.json](vercel.json) — daily alerts, weekly/monthly reports, reliability recompute, drive backup. כל endpoint מוגן ב־`CRON_SECRET`.

ראה [docs/API.md](docs/API.md) למפת ה־API המלאה ו־[docs/OPERATIONS.md](docs/OPERATIONS.md) למדריך תפעול שוטף.

---

## פריסה

- **Vercel** — pages + cron (`vercel.json`).
- **Render** — אם רוצים worker מתמשך, ראה `render.yaml`.
- ב־Vercel ה־worker רץ דרך `instrumentation.ts` לכל בקשה ב־Node runtime; ל־jobs מתמשכים מומלץ Render/Fly עם Node service.

ראה [docs/OPERATIONS.md#deployment](docs/OPERATIONS.md#deployment) להוראות פירוט.

---

## תיעוד נוסף

- [docs/OPERATIONS.md](docs/OPERATIONS.md) — מדריך תפעול: env vars, runbooks, מקרי קצה, תחזוקה
- [docs/API.md](docs/API.md) — תיעוד API: כל endpoint, פרמטרים, דוגמאות
- [AGENTS.md](AGENTS.md) — הוראות לעבודה עם הקוד (Next.js 16 caveats)

---

## רישיון

פנימי — Hakikat. כל הזכויות שמורות.
