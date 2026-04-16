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
   data: { tenant_name, id_number, phone?, unit?, address?, start_date (yyyy-MM-dd), end_date (yyyy-MM-dd), monthly_rent, annual_increase?, building_fee?, arnona? }
   confirmation_needed: true

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
   data: { tenant_name, new_rent? }
   confirmation_needed: true

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
    // Use AI only to generate the additional clauses text
    const prompt = `אתה עורך דין ישראלי. כתוב סעיפים משפטיים קצרים בעברית עבור חוזה שכירות, על סמך ההוראות הבאות מהמשכיר:

${params.ai_instructions}

כתוב רק את הסעיפים עצמם, ללא הקדמה או הסבר. כל סעיף בשורה נפרדת.`;

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
