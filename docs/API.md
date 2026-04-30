# API Reference — Hakikat CRM

תיעוד כל ה־endpoints תחת `src/app/api/**`. כל ה־endpoints מחזירים JSON. שגיאות בפורמט `{ "error": string, "details"?: string }` עם status מתאים.

> **Auth:** רוב ה־endpoints נסמכים על RLS של Supabase דרך הסשן בקליינט. ה־endpoints של cron מוגנים ב־`Authorization: Bearer $CRON_SECRET`. webhooks מוגנים ב־secret/token ייעודי לכל ספק.

> **Base URL:** ב־dev `http://localhost:3000`, ב־prod ה־`NEXT_PUBLIC_APP_URL` שלך.

---

## תוכן

- [Contracts](#contracts)
- [Checks](#checks)
- [Payments & Receipts](#payments)
- [iCount / Morning](#icount)
- [AI Agent](#ai)
- [Notifications & Reports](#notifications)
- [Reliability](#reliability)
- [Backup](#backup)
- [Drive](#drive)
- [Webhooks](#webhooks)
- [Telegram polling](#telegram)

---

<a id="contracts"></a>
## Contracts

### `POST /api/contracts`

יצירת חוזה חדש מה־wizard. עושה upsert לדייר אם צריך, מייצר payment_schedule, מאחסן את הטקסט ב־action_logs לצורכי audit.

**Body:**
```json
{
  "tenant_id": "uuid | optional",
  "tenant_full_name": "string (required if no tenant_id)",
  "tenant_id_number": "string (required if no tenant_id)",
  "tenant_phone": "string",
  "tenant_whatsapp": "string",
  "tenant_email": "string",
  "unit_id": "uuid | null",
  "legal_entity_id": "uuid (required)",
  "start_date": "YYYY-MM-DD (required)",
  "end_date": "YYYY-MM-DD (required)",
  "monthly_rent": "number (required)",
  "annual_increase_percent": 0,
  "building_fee": 0,
  "arnona": 0,
  "payment_method": "checks | transfer | cash",
  "contract_text": "string",
  "ai_instructions": "string"
}
```

**Response 200:**
```json
{ "id": "uuid", "tenant_id": "uuid" }
```

**שגיאות:** `400` — שדות חובה חסרים | `500` — שגיאת DB.

קובץ: [src/app/api/contracts/route.ts](../src/app/api/contracts/route.ts)

---

### `POST /api/contracts/generate`

יצירת טקסט חוזה ע״י Claude מתוך פרטי דייר ונכס.

**Body:**
```json
{
  "tenant_name": "string (required)",
  "id_number": "string",
  "unit": "string (required)",
  "property": "string",
  "start_date": "YYYY-MM-DD (required)",
  "end_date": "YYYY-MM-DD (required)",
  "monthly_rent": "number (required)",
  "annual_increase": 0,
  "building_fee": 0,
  "arnona": 0,
  "ai_instructions": "string",
  "entity_name": "string"
}
```

**Response 200:**
```json
{
  "contract_text": "טקסט החוזה המלא בעברית",
  "generated_at": "ISO timestamp"
}
```

קובץ: [src/app/api/contracts/generate/route.ts](../src/app/api/contracts/generate/route.ts)

---

### `POST /api/contracts/[id]/send-for-signature`

שולח חוזה ל־EasyDo לחתימה דיגיטלית. מעלה ל־Drive (או משתמש ב־URL מ־OneDrive שצורף), פותח טקס חתימה, שומר `easydo_document_id`.

**Body:**
```json
{
  "contract_text": "string (required)",
  "webhook_url": "string (optional override)",
  "destination": "google_drive | onedrive",
  "uploaded_url": "string (required if destination=onedrive)"
}
```

**Response 200:**
```json
{ "easydo_document_id": "string", "drive_url": "string" }
```

**שגיאות:** `400` — חסר טקסט | `404` — חוזה לא נמצא | `500` — Drive/EasyDo נכשלו.

קובץ: [src/app/api/contracts/[id]/send-for-signature/route.ts](../src/app/api/contracts/%5Bid%5D/send-for-signature/route.ts)

---

<a id="checks"></a>
## Checks (סריקת צ׳קים)

### `POST /api/checks/scan`

סריקת תמונות צ׳קים ע״י Claude Vision. מקבל מערך תמונות base64, מחזיר מערך פרטי צ׳קים מחולץ.

**Body:**
```json
{
  "images": ["data:image/jpeg;base64,...", "..."]
}
```

**Response 200:**
```json
[
  {
    "check_number": "1234",
    "bank_name": "לאומי",
    "branch_number": "123",
    "account_number": "456789",
    "amount": 1500,
    "due_date": "2026-05-01"
  }
]
```

**שגיאות:** `400` — אין תמונות | `500` — `ANTHROPIC_API_KEY` לא מוגדר / Claude נכשל.

קובץ: [src/app/api/checks/scan/route.ts](../src/app/api/checks/scan/route.ts)

---

### `POST /api/checks/scan-from-url`

זהה ל־`/scan` אבל מקבל URLs (לדוגמה media URLs מ־WATI). מוריד את התמונות בצד שרת, ממיר ל־base64 ושולח ל־Claude.

**Body:** `{ "urls": ["https://..."] }`

**Response:** זהה ל־`/scan`.

קובץ: [src/app/api/checks/scan-from-url/route.ts](../src/app/api/checks/scan-from-url/route.ts)

---

### `POST /api/checks/scan-and-record`

מקבל צ׳קים שנסרקו ושומר אותם כ־check + payment + receipt בטרנזקציה. משמש את ה־UI אחרי ש־`/scan` החזיר.

**Body:**
```json
{
  "tenant_id": "uuid (required)",
  "contract_id": "uuid (required)",
  "checks": [
    {
      "check_number": "1234",
      "bank_name": "לאומי",
      "branch_number": "123",
      "account_number": "456789",
      "amount": 1500,
      "due_date": "2026-05-01",
      "image_url": "https://..."
    }
  ],
  "source": "manual | whatsapp_agent"
}
```

**Response 200:**
```json
{
  "results": [
    { "check_number": "1234", "for_month": "2026-05", "payment_id": "uuid", "receipt_url": "https://..." }
  ],
  "errors": [
    { "check_number": "?", "error": "חסר מספר צ׳ק / סכום / תאריך פירעון" }
  ]
}
```

קובץ: [src/app/api/checks/scan-and-record/route.ts](../src/app/api/checks/scan-and-record/route.ts)

---

<a id="payments"></a>
## Payments & Receipts

### `POST /api/payments/[id]/issue-receipt`

הנפקת קבלה לתשלום קיים. בוחר אוטומטית בין Morning ל־iCount בהתאם להגדרות `settings`.

**Body:** ריק.

**Response 200 (success):**
```json
{ "docnum": "1234", "doc_id": "string", "doc_url": "https://..." }
```

**Response 200 (skipped):** `{ "skipped": true }` — ישות שלא מפיקה מסמכים חשבונאיים.

**שגיאות:** `400` — חסר id | `500` — הנפקה נכשלה.

קובץ: [src/app/api/payments/[id]/issue-receipt/route.ts](../src/app/api/payments/%5Bid%5D/issue-receipt/route.ts)

---

<a id="icount"></a>
## iCount / Morning (Green Invoice)

### `POST /api/icount/receipt`

הנפקת קבלה ישירה דרך Morning. שימושי ל־flows שלא קשורים לתשלום קיים.

**Body:**
```json
{
  "client_name": "string (required)",
  "client_id": "string",
  "amount": "number (required)",
  "description": "שכר דירה",
  "email": "string",
  "legal_entity_name": "string"
}
```

**Response 200:** `{ "docnum": "1234", "doc_url": "https://...", "doc_id": "string" }`

**Response 400 (skipped):** עבור ישות "חקיקת פרטי" — `{ "error": "...", "skipped": true }`.

קובץ: [src/app/api/icount/receipt/route.ts](../src/app/api/icount/receipt/route.ts)

---

### `POST /api/icount/invoice`

זהה ל־`/receipt` אבל יוצר חשבונית במקום קבלה.

קובץ: [src/app/api/icount/invoice/route.ts](../src/app/api/icount/invoice/route.ts)

---

<a id="ai"></a>
## AI Agent

### `POST /api/ai-agent`

ממשק chat עם הסוכן (Claude). מקבל הודעה בעברית, מחזיר תוצאה: או טקסט תגובה, או `confirmation_needed` עם פעולה ממתינה.

**Body:**
```json
{ "message": "צור חוזה לדייר משה כהן..." }
```

**Response 200 (immediate):**
```json
{
  "response": "טקסט התגובה",
  "executed_action": { "type": "create_contract", "result": {...} }
}
```

**Response 200 (needs confirmation):**
```json
{
  "response": "האם לאשר?",
  "confirmation_needed": true,
  "pending_action": { "type": "...", "data": {...} }
}
```

**שגיאות:** `400` — `message` ריק | `500` — Claude נכשל.

קובץ: [src/app/api/ai-agent/route.ts](../src/app/api/ai-agent/route.ts)

---

<a id="notifications"></a>
## Notifications & Reports (cron-protected)

### `GET /api/notifications/check`

מפעיל את `daily-alerts` job. אם pg-boss רץ → מציב ב־queue (singleton יומי). אחרת → רץ inline.

**Headers:** `Authorization: Bearer $CRON_SECRET`

**Response (queued):** `{ "queued": true, "jobId": "string" }`
**Response (inline):** `{ "ran_inline": true, "alerts_created": <n> }`

**שגיאות:** `401` — token לא תקין.

**Cron:** `0 6 * * *` (06:00 UTC כל יום).

קובץ: [src/app/api/notifications/check/route.ts](../src/app/api/notifications/check/route.ts)

---

### `GET /api/reports/whatsapp?kind=weekly|monthly`

שולח דוח שבועי/חודשי למנהל ב־WhatsApp.

**Headers:** `Authorization: Bearer $CRON_SECRET`
**Query:** `kind=weekly` או `kind=monthly` (חובה).

**Response:** `{ "queued": true, "jobId": "string" }` או inline.

**Cron:** weekly — `15 6 * * 0` | monthly — `30 6 1 * *`.

קובץ: [src/app/api/reports/whatsapp/route.ts](../src/app/api/reports/whatsapp/route.ts)

---

<a id="reliability"></a>
## Reliability

### `GET /api/reliability/recompute`

מחשב מחדש את ציון האמינות לכל הדיירים (RPC `compute_reliability_scores`).

**Headers:** `Authorization: Bearer $CRON_SECRET`
**Response:** `{ "queued": true, "jobId": "string" }` או inline.
**Cron:** `30 0 * * *`.

קובץ: [src/app/api/reliability/recompute/route.ts](../src/app/api/reliability/recompute/route.ts)

---

<a id="backup"></a>
## Backup

### `GET /api/backup/drive`

מייצא טבלאות ליבה ל־CSV ומעלה ל־Google Drive (תיקיית `GOOGLE_DRIVE_BACKUP_FOLDER_ID`).

**Headers:** `Authorization: Bearer $CRON_SECRET`
**Response:** `{ "queued": true, "jobId": "string" }`
**Cron:** `0 1 * * 0` (ראשון 01:00 UTC).

קובץ: [src/app/api/backup/drive/route.ts](../src/app/api/backup/drive/route.ts)

---

<a id="drive"></a>
## Drive

### `POST /api/drive/upload`

נקודת קצה למקרה שלקוח OneDrive שולח לכאן בטעות. **תמיד מחזיר 400** עם הסבר ש־OneDrive uploads קורים בצד הלקוח (PKCE).

קובץ: [src/app/api/drive/upload/route.ts](../src/app/api/drive/upload/route.ts)

---

<a id="webhooks"></a>
## Webhooks

### `POST /api/webhooks/easydo`

מקבל אירועי חתימה מ־EasyDo: `sent | viewed | signed | declined`.
- **signed** — מוריד PDF, מעלה ל־Drive, מעדכן `contracts.status='active'`, שולח WhatsApp ברכה לדייר, יוצר תשלום ראשון אם מוגדר.
- **declined** — מעדכן `contracts.status='cancelled'`.

**Auth:** signature/secret בכותרת בהתאם ל־`EASYDO_WEBHOOK_SECRET`.

קובץ: [src/app/api/webhooks/easydo/route.ts](../src/app/api/webhooks/easydo/route.ts)

---

### `POST /api/webhooks/wati`

מקבל הודעות WhatsApp נכנסות. שני ערוצים:
- **טקסט** — אם זה אישור (`כן`/`לא`) על pending action — מבצע. אחרת — שולח ל־AI Agent.
- **תמונה / מסמך** — מטפל כסריקת צ׳ק (`handleWhatsAppCheckImage`).

**Auth:** `x-webhook-token: $WATI_WEBHOOK_TOKEN` — חובה.

**Response 200:** מחזיר את התגובה ששלח חזרה לדייר.

**שגיאות:** `401` — token לא תקין.

קובץ: [src/app/api/webhooks/wati/route.ts](../src/app/api/webhooks/wati/route.ts)

---

### `POST /api/webhooks/telegram`

מקבל הודעות Telegram. שולח ל־AI Agent ומחזיר תגובה דרך bot API.

**Auth:** Telegram bot token validation.

קובץ: [src/app/api/webhooks/telegram/route.ts](../src/app/api/webhooks/telegram/route.ts)

---

<a id="telegram"></a>
## Telegram polling

### `GET /api/telegram/poll`

Fallback אם webhook לא זמין — polling ידני להודעות חדשות (`getUpdates`).

קובץ: [src/app/api/telegram/poll/route.ts](../src/app/api/telegram/poll/route.ts)

---

## טבלת תקצירים

| מתודה | Path | אימות | תיאור |
|-------|------|-------|-------|
| POST | `/api/contracts` | session | יצירת חוזה |
| POST | `/api/contracts/generate` | session | יצירת טקסט חוזה (Claude) |
| POST | `/api/contracts/[id]/send-for-signature` | session | שליחה לחתימה (EasyDo) |
| POST | `/api/checks/scan` | session | OCR לצ׳קים (base64) |
| POST | `/api/checks/scan-from-url` | session | OCR לצ׳קים (URLs) |
| POST | `/api/checks/scan-and-record` | session | שמירת צ׳קים כ־payments |
| POST | `/api/payments/[id]/issue-receipt` | session | הנפקת קבלה |
| POST | `/api/icount/receipt` | session | קבלה Morning |
| POST | `/api/icount/invoice` | session | חשבונית Morning |
| POST | `/api/ai-agent` | session | chat עם הסוכן |
| GET | `/api/notifications/check` | CRON | התראות יומיות |
| GET | `/api/reports/whatsapp?kind=...` | CRON | דוח שבועי/חודשי |
| GET | `/api/reliability/recompute` | CRON | ציון אמינות |
| GET | `/api/backup/drive` | CRON | גיבוי Drive |
| POST | `/api/drive/upload` | — | תמיד 400 |
| POST | `/api/webhooks/easydo` | secret | חתימה |
| POST | `/api/webhooks/wati` | token | WhatsApp נכנס |
| POST | `/api/webhooks/telegram` | bot token | Telegram נכנס |
| GET | `/api/telegram/poll` | — | polling ידני |

---

## דוגמאות `curl`

```bash
# הפעלת alerts
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.com/api/notifications/check

# יצירת טקסט חוזה
curl -X POST https://your-app.com/api/contracts/generate \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_name": "משה כהן",
    "id_number": "123456789",
    "unit": "דירה 5",
    "start_date": "2026-05-01",
    "end_date": "2027-04-30",
    "monthly_rent": 5000
  }'

# שליחת הודעה לסוכן
curl -X POST https://your-app.com/api/ai-agent \
  -H "Content-Type: application/json" \
  -d '{"message":"כמה דיירים יש לי?"}'
```
