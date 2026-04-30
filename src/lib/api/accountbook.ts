// Accountbook (TIUDIT) document API.
// Replaces the prior Morning/Greeninvoice integration.
//
// Required env vars:
//   ACCOUNTBOOK_USERNAME
//   ACCOUNTBOOK_PASSWORD
//   ACCOUNTBOOK_ESEK_NUM      // numeric business id assigned by Accountbook
//   ACCOUNTBOOK_BASE_URL      // optional, defaults to https://cloud.tamal.co.il
//   ACCOUNTBOOK_VAT_RATE      // optional, default 18
//   ACCOUNTBOOK_VAT_EXEMPT    // "true" for עוסק פטור / עמותה — switches "invoice" → 300

const ACCOUNTBOOK_BASE_URL =
  process.env.ACCOUNTBOOK_BASE_URL || "https://cloud.tamal.co.il";
const ACCOUNTBOOK_USERNAME = process.env.ACCOUNTBOOK_USERNAME;
const ACCOUNTBOOK_PASSWORD = process.env.ACCOUNTBOOK_PASSWORD;
const ACCOUNTBOOK_ESEK_NUM = process.env.ACCOUNTBOOK_ESEK_NUM
  ? Number(process.env.ACCOUNTBOOK_ESEK_NUM)
  : null;
const ACCOUNTBOOK_VAT_RATE = Number(process.env.ACCOUNTBOOK_VAT_RATE ?? "18");
const ACCOUNTBOOK_VAT_EXEMPT = process.env.ACCOUNTBOOK_VAT_EXEMPT === "true";

let cachedToken: { token: string; expires: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token;

  if (!ACCOUNTBOOK_USERNAME || !ACCOUNTBOOK_PASSWORD) {
    throw new Error("Accountbook credentials not configured");
  }

  const body = new URLSearchParams({
    userName: ACCOUNTBOOK_USERNAME,
    userPass: ACCOUNTBOOK_PASSWORD,
  });

  const res = await fetch(`${ACCOUNTBOOK_BASE_URL}/GetToken/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; encoding=UTF-8" },
    body,
  });

  if (!res.ok) throw new Error(`Accountbook GetToken HTTP ${res.status}`);

  const text = (await res.text()).trim();
  // Errors are negative codes prefixed with "-"; success is "<token>,<x>,<y>".
  if (text.startsWith("-")) {
    throw new Error(`Accountbook GetToken error: ${text}`);
  }
  const parts = text.split(",");
  if (!parts[0]) {
    throw new Error(`Accountbook GetToken malformed response: ${text}`);
  }

  cachedToken = { token: parts[0], expires: Date.now() + 55 * 60 * 1000 };
  return parts[0];
}

function escapeXmlAttr(s: string | number): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildAttrs(attrs: Record<string, string | number>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeXmlAttr(v)}"`)
    .join(" ");
}

interface ProductLine {
  description: string;
  quantity: number;
  unitPriceILS: number;
  lineTotal: number;
}

function buildProductsXML(esekNum: number, lines: ProductLine[]): string {
  const rows = lines.map((l, idx) =>
    `<ROW ${buildAttrs({
      DDP_LineID: idx,
      DDP_EsekNum: esekNum,
      DDP_ProductNum: 0,
      DDP_ProductDetail: l.description,
      DDP_ProductUnitMeasurementUnitCode: 1,
      DDP_Quantity: l.quantity.toFixed(4),
      DDP_ProductCurrencyID: 0, // ILS
      DDP_ProductUnitPrice: l.unitPriceILS.toFixed(2),
      DDP_ExchangeRate: "1.0000",
      DDP_UnitPriceILS: l.unitPriceILS.toFixed(2),
      DDP_DiscountPercentage: "0.00",
      DDP_DiscountSum: "0.00",
      DDP_LineTotal: l.lineTotal.toFixed(2),
      SrcDocType: "",
      SrcDocNumber: "",
    })} />`
  );
  return `<ROWS>${rows.join("")}</ROWS>`;
}

interface ChargeLine {
  payMethod: 1 | 2 | 3 | 4 | 8;
  paymentDate: string; // yyyy-MM-dd
  sum: number;
  bankCode?: string;
  bankBranchCode?: string;
  bankAccountNum?: string;
  checkNum?: string;
  creditCardIssuerCode?: string;
  creditTransactionTypeCode?: string;
  firstCreditPayment?: string;
  creditPayments?: string;
  addCreditPaymentsSum?: string;
}

function buildChargesXML(lines: ChargeLine[]): string {
  const rows = lines.map((c, idx) =>
    `<ROW ${buildAttrs({
      DDR_LineID: idx + 1,
      DDR_PayMethodTypeCode: c.payMethod,
      DDR_CheckPaymentDate: c.paymentDate,
      DDR_Sum: c.sum.toFixed(2),
      DDR_ForInvProduction: "False",
      DDR_BankCode: c.bankCode ?? "",
      DDR_CreditCardIssuerCode: c.creditCardIssuerCode ?? "",
      DDR_CreditTransactionTypeCode: c.creditTransactionTypeCode ?? "",
      DDR_FirstCreditPayment: c.firstCreditPayment ?? "",
      DDR_CreditPayments: c.creditPayments ?? "",
      DDR_AddCreditPaymentsSum: c.addCreditPaymentsSum ?? "",
      DDR_BankBranchCode: c.bankBranchCode ?? "",
      DDR_BankAccountNum: c.bankAccountNum ?? "",
      DDR_CheckNum: c.checkNum ?? "",
    })} />`
  );
  return `<ROWS>${rows.join("")}</ROWS>`;
}

export type AccountbookDocumentType =
  | "receipt"
  | "invoice_receipt"
  | "invoice"
  | "credit_note";

function typeCodeFor(type: AccountbookDocumentType): number {
  switch (type) {
    case "receipt":
      return 400;
    case "invoice_receipt":
      return 320;
    case "credit_note":
      return 330;
    case "invoice":
      // 300 = חשבונית עסקה (osek patur / amuta), 305 = חשבונית מס (osek murshe)
      return ACCOUNTBOOK_VAT_EXEMPT ? 300 : 305;
  }
}

export interface AccountbookDocumentParams {
  client_name: string;
  client_id?: string;
  client_email?: string;
  client_address?: string;
  client_city_zip?: string;
  /**
   * Accountbook ClientNumber. If omitted, defaults to 200000 (the reserved
   * "random client" id) and the document carries `client_name` ad-hoc instead
   * of being linked to a real client card. Pass a real ClientNumber when the
   * tenant has been linked via /api/accountbook/link-tenants.
   */
  client_number?: number;
  amount: number;
  description: string;
  type: AccountbookDocumentType;
  produced_date?: Date;
}

export interface AccountbookDocumentResponse {
  id: string;
  number: number;
  url: string;
  preview_url: string;
}

export async function createAccountbookDocument(
  p: AccountbookDocumentParams
): Promise<AccountbookDocumentResponse> {
  if (!ACCOUNTBOOK_ESEK_NUM) {
    throw new Error("ACCOUNTBOOK_ESEK_NUM not configured");
  }
  const token = await getToken();
  const esekNum = ACCOUNTBOOK_ESEK_NUM;
  const typeCode = typeCodeFor(p.type);

  const producedDate = p.produced_date ?? new Date();
  const dd = String(producedDate.getDate()).padStart(2, "0");
  const mm = String(producedDate.getMonth() + 1).padStart(2, "0");
  const yyyy = String(producedDate.getFullYear());
  const producedDateString = `${dd}/${mm}/${yyyy}`;

  // Treat `amount` as the gross amount the tenant paid.
  // When VAT applies, back out the net for the line/SumBeforeMaam.
  const total = Number(p.amount.toFixed(2));
  const isVatExempt = ACCOUNTBOOK_VAT_EXEMPT;
  const vatRate = isVatExempt ? 0 : ACCOUNTBOOK_VAT_RATE;
  const totalBeforeMaam = isVatExempt
    ? total
    : Math.round((total / (1 + vatRate / 100)) * 100) / 100;
  const vatAmount = Math.round((total - totalBeforeMaam) * 100) / 100;

  // Document types that require products vs charges (per Accountbook docs).
  const PRODUCT_TYPES = new Set([100, 10100, 300, 10301, 305, 320, 330]);
  const CHARGE_TYPES = new Set([320, 400, 405]);

  const productsXML = PRODUCT_TYPES.has(typeCode)
    ? buildProductsXML(esekNum, [
        {
          description: (p.description || "").slice(0, 150),
          quantity: 1,
          unitPriceILS: totalBeforeMaam,
          lineTotal: totalBeforeMaam,
        },
      ])
    : "";

  // Single cash charge line — bank-typed payments would require bank/branch
  // codes from GetBanksList that we don't currently map. Cash (type 1) is
  // valid for any payment method and avoids guessing.
  const chargesXML = CHARGE_TYPES.has(typeCode)
    ? buildChargesXML([
        {
          payMethod: 1,
          paymentDate: producedDate.toISOString().slice(0, 10),
          sum: total,
        },
      ])
    : "";

  const doc = {
    DocID: null,
    EsekNum: esekNum,
    ClientNumber: p.client_number ?? 200000, // 200000 = reserved "random client"
    TypeCode: typeCode,
    PrintLanguage: 0,
    DocNumber: "",
    ClientName: (p.client_name || "").slice(0, 60),
    ClientAddress: (p.client_address || "").slice(0, 60),
    ClientCityZip: (p.client_city_zip || "").slice(0, 40),
    ClientOsekNum: (p.client_id || "").slice(0, 9),
    ProducedDateString: producedDateString,
    SumBeforeDiscount: totalBeforeMaam,
    DiscountAmount: 0,
    DiscountPercentage: 0,
    TotalBeforeMaam: totalBeforeMaam,
    DocMaamAmount: vatAmount,
    DocTotalDue: total,
    DocNikuyBamakorSum: 0,
    DocUserFullName: "",
    DocDetail: (p.description || "").slice(0, 150),
    DocNotMaam: isVatExempt ? 1 : 0,
    MaamRate: vatRate,
    GeneralRemark: "",
    DocTypeRemark: "",
    DocProductsXML: productsXML,
    DocChargesXML: chargesXML,
    DocClosureXML: null,
    DocIsSourceProduced: 0,
    DocSigned: 0,
    SourceDocID: null,
    SourceTypeCode: null,
    SourceDocNumber: null,
    DocFromApi: null,
  };

  const body = new URLSearchParams({
    credentialsToken: token,
    jsonString: JSON.stringify(doc),
    toSign: "0",
    toMail: p.client_email ? "1" : "0",
    isItemPriceWithTax: PRODUCT_TYPES.has(typeCode) ? "0" : "0",
    randomClientMail: p.client_email || "",
    ClientIdentifier: `crm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  });

  const res = await fetch(`${ACCOUNTBOOK_BASE_URL}/CreateDocument/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; encoding=UTF-8" },
    body,
  });

  if (!res.ok) throw new Error(`Accountbook CreateDocument HTTP ${res.status}`);

  const text = (await res.text()).trim();

  // Standalone error codes ("-2000", "-100") or any negative-prefixed segment = failure.
  if (text.startsWith("-")) {
    throw new Error(`Accountbook CreateDocument error: ${text}`);
  }
  const parts = text.split(",");
  if (parts.some((s) => s.trim().startsWith("-"))) {
    throw new Error(`Accountbook CreateDocument error: ${text}`);
  }
  // Success format: requestNum,docNum,pdfUrl,previewUrl
  if (parts.length < 4 || !parts[1] || !parts[2]) {
    throw new Error(`Accountbook CreateDocument unexpected response: ${text}`);
  }

  const docNum = Number(parts[1]);
  return {
    id: String(docNum),
    number: docNum,
    url: parts[2],
    preview_url: parts[3],
  };
}

export interface AccountbookClient {
  client_id: number;       // ClientNumber to use on documents
  company_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  area_code: string;
  phone: string;
  osek_num: string;
  email: string;
  not_active: boolean;
  customer_balance: number;
}

/**
 * Fetch the company's full client list from Accountbook.
 *
 * Accountbook does not expose a "create client" endpoint via API — clients
 * must exist in their web UI. This list is the source of truth we link
 * tenants against.
 */
export async function listAccountbookClients(): Promise<AccountbookClient[]> {
  const token = await getToken();
  const url = `${ACCOUNTBOOK_BASE_URL}/GetClientsListMin/?credentialstoken=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`Accountbook GetClientsListMin HTTP ${res.status}`);
  const text = (await res.text()).trim();
  if (text.startsWith("-")) {
    throw new Error(`Accountbook GetClientsListMin error: ${text}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`Accountbook GetClientsListMin malformed JSON: ${text.slice(0, 200)}`);
  }
  if (!Array.isArray(raw)) {
    throw new Error(`Accountbook GetClientsListMin expected array, got: ${typeof raw}`);
  }
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const first = String(r.FirstName ?? "").trim();
    const last = String(r.Lastname ?? r.LastName ?? "").trim();
    return {
      client_id: Number(r.ClientID ?? 0),
      company_id: Number(r.CompanyID ?? 0),
      first_name: first,
      last_name: last,
      full_name: `${first} ${last}`.trim(),
      area_code: String(r.AreaCode1 ?? "").trim(),
      phone: String(r.Phone1 ?? "").trim(),
      osek_num: String(r.OsekNum ?? "").trim(),
      email: String(r.Email ?? "").trim(),
      not_active: Boolean(Number(r.NotActive ?? 0)),
      customer_balance: Number(r.CustomerBalance ?? 0),
    };
  });
}

function normalizePhone(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "");
}

function normalizeName(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface TenantLikeForMatching {
  id: string;
  full_name: string;
  id_number: string | null;
  phone: string | null;
  email: string | null;
}

export interface ClientMatch {
  tenant_id: string;
  client_id: number;
  matched_by: "osek_num" | "email" | "phone" | "name";
}

/**
 * Match a list of tenants against an Accountbook client list.
 *
 * Match priority:
 *   1. OsekNum (tenant.id_number) — strongest signal
 *   2. Email
 *   3. Phone (digits only)
 *   4. Full name (last resort, only if unambiguous)
 *
 * Only returns matches that are unambiguous (single client matches the
 * tenant on the chosen key). Ambiguous matches are skipped — link them
 * manually.
 */
export function matchTenantsToClients(
  tenants: TenantLikeForMatching[],
  clients: AccountbookClient[]
): ClientMatch[] {
  const active = clients.filter((c) => !c.not_active && c.client_id);

  const byOsek = new Map<string, AccountbookClient[]>();
  const byEmail = new Map<string, AccountbookClient[]>();
  const byPhone = new Map<string, AccountbookClient[]>();
  const byName = new Map<string, AccountbookClient[]>();
  for (const c of active) {
    if (c.osek_num) byOsek.set(c.osek_num, [...(byOsek.get(c.osek_num) || []), c]);
    if (c.email) {
      const k = c.email.toLowerCase();
      byEmail.set(k, [...(byEmail.get(k) || []), c]);
    }
    const phone = normalizePhone(`${c.area_code}${c.phone}`);
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) || []), c]);
    const name = normalizeName(c.full_name);
    if (name) byName.set(name, [...(byName.get(name) || []), c]);
  }

  const pickUnique = (
    list: AccountbookClient[] | undefined
  ): AccountbookClient | null => (list && list.length === 1 ? list[0] : null);

  const matches: ClientMatch[] = [];
  for (const t of tenants) {
    const osek = (t.id_number || "").trim();
    const osekHit = osek ? pickUnique(byOsek.get(osek)) : null;
    if (osekHit) {
      matches.push({ tenant_id: t.id, client_id: osekHit.client_id, matched_by: "osek_num" });
      continue;
    }
    const emailKey = (t.email || "").trim().toLowerCase();
    const emailHit = emailKey ? pickUnique(byEmail.get(emailKey)) : null;
    if (emailHit) {
      matches.push({ tenant_id: t.id, client_id: emailHit.client_id, matched_by: "email" });
      continue;
    }
    const phoneKey = normalizePhone(t.phone);
    const phoneHit = phoneKey ? pickUnique(byPhone.get(phoneKey)) : null;
    if (phoneHit) {
      matches.push({ tenant_id: t.id, client_id: phoneHit.client_id, matched_by: "phone" });
      continue;
    }
    const nameKey = normalizeName(t.full_name);
    const nameHit = nameKey ? pickUnique(byName.get(nameKey)) : null;
    if (nameHit) {
      matches.push({ tenant_id: t.id, client_id: nameHit.client_id, matched_by: "name" });
    }
  }
  return matches;
}
