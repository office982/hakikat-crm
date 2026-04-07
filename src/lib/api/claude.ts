function getApiKey() {
  return process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "";
}

const SYSTEM_PROMPT = `אתה עוזר ניהול נדל"ן של קבוצת חקיקת.
אתה מקבל הודעות בעברית ומבצע פעולות במערכת.

הנכסים שלנו:
- מתחם החקלאי: כלבייה 1 (חנויות 1-14), כלבייה 2 (חנויות 15-30), אורוות האמנים
- רמז: הזמיר 27 (דירה קטנה/גדולה), האשכולית
- תבורי: דירה עמית, דירה עידו
- הרצל 48: דירה 1, 3, 5, 7
- הדקלים 123 פרדס חנה

זהה את סוג הפעולה המבוקשת והחזר JSON בלבד בפורמט:
{
  "action": "record_payment" | "create_contract" | "add_project_expense" | "query_balance" | "send_reminder" | "unknown",
  "data": { ... פרטי הפעולה ... },
  "confirmation_needed": true/false,
  "confirmation_message": "טקסט לאישור המשתמש בעברית",
  "response_message": "תגובה לשלוח בחזרה למשתמש"
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
  const isCommercial = params.entity_name ? params.entity_name.includes("נכסים") : true;
  const template = isCommercial ? COMMERCIAL_CONTRACT_TEMPLATE : PRIVATE_CONTRACT_TEMPLATE;

  const extraInstructions = params.ai_instructions
    ? `\n\nהוראות נוספות מהמשכיר (שלב אותן בחוזה כסעיפים נוספים):\n${params.ai_instructions}`
    : "";

  const prompt = `אתה מקבל תבנית חוזה שכירות ${isCommercial ? "עסקי" : "פרטי"} של קבוצת חקיקת.
מלא את התבנית עם הפרטים הבאים:

- שם דייר (שוכר): ${params.tenant_name}
- ת.ז שוכר: ${params.id_number}
- יחידה: ${params.unit} ב${params.property}
- תאריך התחלה: ${params.start_date}
- תאריך סיום: ${params.end_date}
- שכ"ד חודשי: ${params.monthly_rent} ₪
- עלייה שנתית: ${params.annual_increase}%
- ועד בית: ${params.building_fee} ₪
- ארנונה: ${params.arnona} ₪${extraInstructions}

הנה התבנית — מלא את כל השדות המסומנים ב-{{ }} והחזר חוזה מלא ומוכן:

${template}

הנחיות:
1. מלא את כל השדות המסומנים ב-{{ }} עם הפרטים שניתנו
2. אם יש הוראות נוספות — הוסף אותן כסעיפים במקום {{ADDITIONAL_CLAUSES}}
3. אם אין הוראות נוספות — הסר את {{ADDITIONAL_CLAUSES}}
4. שמור על כל הסעיפים המקוריים של החוזה — אל תמחק ואל תשנה אותם
5. החזר רק את טקסט החוזה המלא, ללא הסברים`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const result = await response.json();
  return result.content?.[0]?.text || "";
}
