function getApiKey() {
  return process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

const SYSTEM_PROMPT = `אתה סוכן AI של קבוצת חקיקת — מערכת ניהול נדל"ן מניב.
אתה מקבל הודעות בעברית מהבעלים (שלמה) דרך וואטסאפ ומבצע פעולות.

הנכסים שלנו:
- מתחם החקלאי: כלבייה 1 (חנויות 1-14), כלבייה 2 (חנויות 15-30), אורוות האמנים
- רמז: הזמיר 27 (דירה קטנה/גדולה), האשכולית
- תבורי: דירה עמית, דירה עידו
- הרצל 48: דירה 1, 3, 5, 7
- הדקלים 123 פרדס חנה

────────────────────────
סוגי פעולות והשדות הנדרשים:

1. record_payment — רישום תשלום
   data: { tenant_name, amount, month (פורמט MM/yyyy), payment_method: "transfer"|"cash"|"check", check_number?, check_bank?, notes? }
   confirmation_needed: true

2. create_contract — יצירת חוזה חדש
   data: {
     tenant_name, id_number, phone?, email?,
     unit?, address?,
     start_date (yyyy-MM-dd), end_date (yyyy-MM-dd),
     monthly_rent, annual_increase?, building_fee?, arnona?,
     payment_method?: "checks"|"transfer"|"cash",
     ai_instructions?  // טקסט חופשי לתוספות לחוזה (למשל "אסור בעלי חיים")
   }
   confirmation_needed: true
   הערה: אסוף את כל הפרטים שניתן לחוזה לפני שליחה. אם חסר ת״ז או תאריכים — בקש הבהרה.

3. add_project_expense — רישום הוצאה בפרויקט
   data: { project_name, supplier_name, amount, description?, paid: true/false }
   confirmation_needed: true

4. query_balance — בדיקת יתרה של דייר
   data: { tenant_name }
   confirmation_needed: false

5. query_report — סיכום חודשי / דוח
   data: { month (פורמט MM/yyyy) }
   confirmation_needed: false

6. send_reminder — שליחת תזכורת תשלום לדייר
   data: { tenant_name }
   confirmation_needed: true

7. mark_check_bounced — צ'ק חוזר
   data: { tenant_name, month (פורמט MM/yyyy) }
   confirmation_needed: true

8. renew_contract — חידוש חוזה
   data: { tenant_name, new_rent?, months? }
   confirmation_needed: true

9. query_reliability — בדיקת דירוג אמינות דייר
   data: { tenant_name }
   confirmation_needed: false

10. compare_checks — השוואת צ'קים לחוזה של דייר (צפוי מול התקבל)
    data: { tenant_name }
    confirmation_needed: false

11. create_project — פתיחת פרויקט חדש
    data: { project_name, total_budget?, status?: "planning"|"active"|"completed", address?, description? }
    confirmation_needed: true

12. list_projects — רשימת פרויקטים
    data: {}
    confirmation_needed: false

13. delete_project — מחיקת פרויקט (ייכשל אם יש הוצאות)
    data: { project_name }
    confirmation_needed: true

14. list_overdue — רשימת דיירים בפיגור
    data: {}
    confirmation_needed: false

────────────────────────
כללים:
- תאריכים: "מ-1.6.26" = "2026-06-01", "עד 31.5.27" = "2027-05-31"
- חודשים: "עבור מאי" = "05/2026" (השנה הנוכחית אם לא צוינה)
- סכומים: "4,500 שקל" = 4500
- "שילם", "קיבלתי", "העביר" = record_payment
- "מה המצב ב", "סיכום", "תן דוח" = query_report / query_balance
- "תזכיר", "שלח תזכורת" = send_reminder
- "צ'ק חזר" = mark_check_bounced
- "חידוש", "להאריך חוזה" = renew_contract
- "אמינות", "דירוג" = query_reliability
- "השוואת צ'קים", "השווה צ'קים" = compare_checks
- "פתח/צור פרויקט" = create_project
- "אילו פרויקטים יש", "רשימת פרויקטים" = list_projects
- "מחק פרויקט", "סגור פרויקט" = delete_project
- "מי בפיגור", "מי לא שילם" = list_overdue
- אם המשתמש שולח תמונה (לא טקסט) — תמיד מדובר בצ'ק לסריקה. הטיפול נעשה ב-pipeline נפרד.
- אם לא ברור — שאל שאלת הבהרה (action: "unknown")

החזר JSON בלבד:
{
  "action": "...",
  "data": { ... },
  "confirmation_needed": true/false,
  "confirmation_message": "סיכום הפעולה + שאלת אישור בעברית",
  "response_message": "תגובה ישירה בעברית (לפעולות ללא אישור)"
}`;

export interface AIAgentResponse {
  action: string;
  data: Record<string, unknown>;
  confirmation_needed: boolean;
  confirmation_message: string;
  response_message: string;
}

export async function callAIAgent(userMessage: string): Promise<AIAgentResponse> {
  if (!getApiKey()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} — ${err}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text || "";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      action: "unknown",
      data: {},
      confirmation_needed: false,
      confirmation_message: "",
      response_message: "לא הצלחתי להבין את הבקשה. נסה שוב.",
    };
  }

  return JSON.parse(jsonMatch[0]);
}

export async function generateContractText(params: {
  tenant_name: string;
  id_number: string;
  unit: string;
  property: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  annual_increase: number;
  building_fee: number;
  arnona: number;
  ai_instructions?: string;
  entity_name?: string;
}): Promise<string> {
  if (!getApiKey()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  // Dynamically import templates
  const { COMMERCIAL_CONTRACT_TEMPLATE, PRIVATE_CONTRACT_TEMPLATE } = await import("@/lib/contract-templates");

  // חקיקת נכסים = חוזה עסקי, חקיקת פרטי = חוזה פרטי
  const entityStr = String(params.entity_name || "").toLowerCase();
  const isPrivate = entityStr.includes("פרטי");
  const isCommercial = !isPrivate;
  const template = isCommercial ? COMMERCIAL_CONTRACT_TEMPLATE : PRIVATE_CONTRACT_TEMPLATE;

  const extraInstructions = params.ai_instructions
    ? `\n\nהוראות נוספות מהמשכיר (שלב אותן בחוזה כסעיפים נוספים):\n${params.ai_instructions}`
    : "";

  // Build replacement values
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
  const startParts = params.start_date.split("-");
  const endParts = params.end_date.split("-");
  const startStr = `${startParts[2]}/${startParts[1]}/${startParts[0]}`;
  const endStr = `${endParts[2]}/${endParts[1]}/${endParts[0]}`;
  const months = Math.round((new Date(params.end_date).getTime() - new Date(params.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30));
  const durationStr = months >= 12 ? `${Math.round(months / 12)} שנים (${months} חודשים)` : `${months} חודשים`;

  const arnonaClause = params.arnona > 0 ? `${params.arnona} ₪ תשלום ארנונה לכל חודש.` : "";
  const buildingFeeClause = params.building_fee > 0 ? `${params.building_fee} ₪ תשלום וועד בית לכל חודש.` : "";

  // Do direct replacement first — no AI needed for simple fields
  let filledContract = template
    .replace(/\{\{DATE\}\}/g, dateStr)
    .replace(/\{\{LANDLORD_NAME\}\}/g, isCommercial ? "חקיקת נכסים" : "שלמה חקיקת")
    .replace(/\{\{LANDLORD_ID\}\}/g, isCommercial ? "064813116" : "022554521")
    .replace(/\{\{TENANT_NAME\}\}/g, params.tenant_name)
    .replace(/\{\{TENANT_ID\}\}/g, params.id_number)
    .replace(/\{\{UNIT_DESCRIPTION\}\}/g, params.unit)
    .replace(/\{\{PROPERTY_ADDRESS\}\}/g, params.property)
    .replace(/\{\{CONTRACT_DURATION\}\}/g, durationStr)
    .replace(/\{\{START_DATE\}\}/g, startStr)
    .replace(/\{\{END_DATE\}\}/g, endStr)
    .replace(/\{\{MONTHLY_RENT\}\}/g, String(params.monthly_rent))
    .replace(/\{\{ARNONA_CLAUSE\}\}/g, arnonaClause)
    .replace(/\{\{BUILDING_FEE_CLAUSE\}\}/g, buildingFeeClause)
    .replace(/\{\{TOTAL_CHECKS\}\}/g, "12");

  // Handle additional clauses
  if (params.ai_instructions) {
    const landlordName = isCommercial ? "חקיקת נכסים" : "שלמה חקיקת";
    const extras: string[] = [];
    if (params.arnona > 0) extras.push(`ארנונה ${params.arnona} ₪ לחודש`);
    if (params.building_fee > 0) extras.push(`ועד בית ${params.building_fee} ₪ לחודש`);
    if (params.annual_increase > 0) extras.push(`העלאה שנתית ${params.annual_increase}%`);
    const extrasLine = extras.length ? `\n- תשלומים נוספים: ${extras.join(", ")}` : "";

    const prompt = `אתה עורך דין ישראלי המנסח תוספות (סעיפים נוספים) לחוזה שכירות קיים. החוזה הבסיסי כבר מנוסח ומכיל את כל הסעיפים הסטנדרטיים: פרטי הצדדים, תיאור המושכר, תקופת השכירות, דמי שכירות חודשיים, חובות השוכר (שמירה, תיקונים, ניקיון), תשלומי חשמל/מים, מטרת המושכר, פינוי מוקדם, אחריות ונזקים, וחתימות.

פרטי החוזה שלתוכו יוכנסו הסעיפים החדשים:
- משכיר: ${landlordName}
- שוכר: ${params.tenant_name} (ת״ז ${params.id_number})
- מושכר: ${params.unit}, ${params.property}
- תקופה: ${startStr} עד ${endStr} (${durationStr})
- שכר דירה חודשי: ${params.monthly_rent} ₪${extrasLine}

הוראות המשכיר להוספה:
"""
${params.ai_instructions}
"""

המשימה: נסח אך ורק את הסעיפים המשפטיים הנוספים הממשים את הוראות המשכיר. הסעיפים יצורפו לסוף החוזה הקיים.

כללים מחייבים:
1. טקסט עברית רגיל בלבד — ללא Markdown, ללא כוכביות (**), ללא סולמיות (#), ללא קוד.
2. השתמש בערכים הממשיים מהחוזה (סכומים, תאריכים, שמות). אסור להשאיר קווים תחתונים (____), סוגריים ריקים, או placeholders כמו "₪___".
3. אל תחזור על סעיפים שכבר קיימים בחוזה הבסיסי. אל תנסח מחדש את שכר הדירה, התקופה, או פרטי הצדדים — הם כבר מופיעים.
4. אם הוראת המשכיר יוצרת חריג לתנאי קיים (למשל "חודש חינם" מול חיוב חודשי), נסח זאת כסייג ממוקד המפנה לתנאי הקיים — לא כסעיף שכר דירה חדש ומלא.
5. כל סעיף: כותרת קצרה מודגשת באמצעות נקודתיים (למשל "חודש שכירות ללא תשלום:") ואז פסקה קצרה (1–3 משפטים) בלשון משפטית פורמלית אך ברורה.
6. אל תוסיף הקדמה, סיכום, הסברים, הערות עריכה, או טקסט על המשימה. החזר רק את גוף הסעיפים.
7. אם הוראת המשכיר אינה ברורה או לא ניתנת ליישום משפטי — החזר מחרוזת ריקה.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getApiKey(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.ok) {
      const result = await response.json();
      const additionalText = result.content?.[0]?.text || "";
      filledContract = filledContract.replace(/\{\{ADDITIONAL_CLAUSES\}\}/g, additionalText);
    } else {
      filledContract = filledContract.replace(/\{\{ADDITIONAL_CLAUSES\}\}/g, "");
    }
  } else {
    filledContract = filledContract.replace(/\{\{ADDITIONAL_CLAUSES\}\}/g, "");
  }

  return filledContract;
}
