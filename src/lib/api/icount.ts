const ICOUNT_COMPANY_ID = process.env.ICOUNT_COMPANY_ID;
const ICOUNT_USER = process.env.ICOUNT_USER;
const ICOUNT_PASS = process.env.ICOUNT_PASS;
const ICOUNT_BASE_URL = "https://api.icount.co.il/api/v3.php";

export interface ICountReceiptParams {
  client_name: string;
  client_id: string;
  amount: number;
  description: string;
  email?: string;
}

export interface ICountResponse {
  status: boolean;
  reason?: string;
  docnum?: string;
  doc_url?: string;
}

/**
 * Issue a receipt via iCount.
 */
export async function issueReceipt(params: ICountReceiptParams): Promise<ICountResponse> {
  if (!ICOUNT_COMPANY_ID || !ICOUNT_USER || !ICOUNT_PASS) {
    throw new Error("iCount credentials not configured");
  }

  const response = await fetch(ICOUNT_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cid: ICOUNT_COMPANY_ID,
      user: ICOUNT_USER,
      pass: ICOUNT_PASS,
      doctype: "receipt",
      client_name: params.client_name,
      client_id: params.client_id,
      items: [
        {
          description: params.description,
          unitprice: params.amount,
          quantity: 1,
        },
      ],
      currency_code: "ILS",
      send_email: params.email ? 1 : 0,
      email: params.email || "",
    }),
  });

  return response.json();
}

/**
 * Issue an invoice via iCount.
 */
export async function issueInvoice(params: ICountReceiptParams): Promise<ICountResponse> {
  if (!ICOUNT_COMPANY_ID || !ICOUNT_USER || !ICOUNT_PASS) {
    throw new Error("iCount credentials not configured");
  }

  const response = await fetch(ICOUNT_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cid: ICOUNT_COMPANY_ID,
      user: ICOUNT_USER,
      pass: ICOUNT_PASS,
      doctype: "invrec",
      client_name: params.client_name,
      client_id: params.client_id,
      items: [
        {
          description: params.description,
          unitprice: params.amount,
          quantity: 1,
        },
      ],
      currency_code: "ILS",
      send_email: params.email ? 1 : 0,
      email: params.email || "",
    }),
  });

  return response.json();
}
