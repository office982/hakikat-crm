const MORNING_API_KEY = process.env.MORNING_API_KEY;
const MORNING_API_SECRET = process.env.MORNING_API_SECRET;
const MORNING_BASE_URL = process.env.MORNING_BASE_URL || "https://api.greeninvoice.co.il/api/v1";

let cachedToken: { token: string; expires: number } | null = null;

/**
 * Get auth token from Morning API.
 */
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) {
    return cachedToken.token;
  }

  if (!MORNING_API_KEY || !MORNING_API_SECRET) {
    throw new Error("Morning API credentials not configured");
  }

  const response = await fetch(`${MORNING_BASE_URL}/account/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: MORNING_API_KEY,
      secret: MORNING_API_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Morning auth error: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.token,
    expires: Date.now() + 55 * 60 * 1000, // 55 minutes
  };

  return data.token;
}

export interface MorningDocumentParams {
  client_name: string;
  client_id?: string;
  client_email?: string;
  amount: number;
  description: string;
  type: "receipt" | "invoice_receipt" | "invoice" | "credit_note";
}

export interface MorningDocumentResponse {
  id: string;
  number: number;
  url: string;
}

/**
 * Create a document (receipt, invoice, etc.) via Morning API.
 */
export async function createMorningDocument(
  params: MorningDocumentParams
): Promise<MorningDocumentResponse> {
  const token = await getToken();

  // Document types mapping
  const typeMap: Record<string, number> = {
    receipt: 400,
    invoice_receipt: 305,
    invoice: 300,
    credit_note: 330,
  };

  const response = await fetch(`${MORNING_BASE_URL}/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      description: params.description,
      type: typeMap[params.type] || 400,
      lang: "he",
      currency: "ILS",
      client: {
        name: params.client_name,
        taxId: params.client_id || undefined,
        emails: params.client_email ? [params.client_email] : [],
      },
      income: [
        {
          description: params.description,
          quantity: 1,
          price: params.amount,
          currency: "ILS",
        },
      ],
      payment: [
        {
          type: 0, // Other
          price: params.amount,
          currency: "ILS",
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Morning API error: ${response.status} — ${err}`);
  }

  const doc = await response.json();

  return {
    id: doc.id,
    number: doc.number,
    url: doc.url,
  };
}

/**
 * Create a client in Morning system.
 */
export async function createMorningClient(params: {
  name: string;
  taxId?: string;
  email?: string;
  phone?: string;
}): Promise<{ id: string }> {
  const token = await getToken();

  const response = await fetch(`${MORNING_BASE_URL}/clients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: params.name,
      taxId: params.taxId,
      emails: params.email ? [params.email] : [],
      phone: params.phone,
    }),
  });

  if (!response.ok) {
    throw new Error(`Morning create client error: ${response.status}`);
  }

  return response.json();
}
