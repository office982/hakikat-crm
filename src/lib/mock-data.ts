export const mockKPIs = {
  monthlyCollection: { collected: 142000, expected: 158000 },
  totalDebt: { amount: 47500, tenantsCount: 8 },
  expiringContracts: 5,
  occupancy: { occupied: 34, total: 40 },
};

export const mockRevenueData = [
  { month: "מאי 25", expected: 155000, actual: 148000 },
  { month: "יוני 25", expected: 155000, actual: 152000 },
  { month: "יולי 25", expected: 155000, actual: 140000 },
  { month: "אוג׳ 25", expected: 155000, actual: 151000 },
  { month: "ספט׳ 25", expected: 158000, actual: 154000 },
  { month: "אוק׳ 25", expected: 158000, actual: 145000 },
  { month: "נוב׳ 25", expected: 158000, actual: 156000 },
  { month: "דצמ׳ 25", expected: 158000, actual: 158000 },
  { month: "ינו׳ 26", expected: 160000, actual: 155000 },
  { month: "פבר׳ 26", expected: 160000, actual: 150000 },
  { month: "מרץ 26", expected: 160000, actual: 157000 },
  { month: "אפר׳ 26", expected: 160000, actual: 142000 },
];

export type AlertPriority = "critical" | "high" | "medium" | "low";

export interface MockAlert {
  id: string;
  priority: AlertPriority;
  title: string;
  description: string;
  type: string;
  actionLabel?: string;
  actionHref?: string;
}

export const mockAlerts: MockAlert[] = [
  {
    id: "1",
    priority: "critical",
    title: "חוב פתוח מעל 30 יום",
    description: "אברהם כהן — חוב של ₪4,500 (כלבייה 1, חנות 3)",
    type: "missing_payment",
    actionLabel: "טפל",
    actionHref: "/tenants/1",
  },
  {
    id: "2",
    priority: "critical",
    title: "חוב פתוח מעל 30 יום",
    description: "יעקב לוי — חוב של ₪3,200 (הזמיר 27, דירה קטנה)",
    type: "missing_payment",
    actionLabel: "טפל",
    actionHref: "/tenants/2",
  },
  {
    id: "3",
    priority: "high",
    title: "חוזה פוקע בעוד 38 יום",
    description: "משה ישראלי — כלבייה 2, חנות 18 — סיום 15/05/2026",
    type: "contract_expiry",
    actionLabel: "חדש חוזה",
    actionHref: "/contracts/new",
  },
  {
    id: "4",
    priority: "medium",
    title: "צ׳ק לפירעון השבוע",
    description: "דוד אלון — ₪2,800 — פירעון 10/04/2026",
    type: "check_due",
  },
  {
    id: "5",
    priority: "low",
    title: "חשבונית ספק לא שולמה",
    description: "חברת החשמל — ₪12,400 — מעל 30 יום",
    type: "unpaid_supplier",
  },
];

export interface MockActivity {
  id: string;
  type: "payment" | "contract" | "message" | "update";
  description: string;
  timestamp: string;
}

export const mockActivities: MockActivity[] = [
  { id: "1", type: "payment", description: "נרשם תשלום ₪2,500 מרחל גולן עבור אפריל 2026", timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: "2", type: "contract", description: "חוזה חדש נחתם — שמעון פרץ, כלבייה 1 חנות 7", timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
  { id: "3", type: "payment", description: "נרשם תשלום ₪1,800 מיוסי מלכה עבור אפריל 2026", timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString() },
  { id: "4", type: "message", description: "נשלחה תזכורת תשלום לאברהם כהן בוואטסאפ", timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
  { id: "5", type: "update", description: "עודכנו פרטי דייר — מרים דוד, הרצל 48 דירה 3", timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString() },
  { id: "6", type: "payment", description: "נרשם תשלום ₪3,200 מעמית בן דוד עבור מרץ 2026", timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() },
  { id: "7", type: "contract", description: "חוזה פג תוקף — דנה כהן, האשכולית", timestamp: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString() },
  { id: "8", type: "payment", description: "נרשם תשלום ₪1,500 מאיתי לב עבור אפריל 2026", timestamp: new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString() },
  { id: "9", type: "message", description: "נשלחה הודעת ברוכים הבאים לדייר חדש — עידו שלום", timestamp: new Date(Date.now() - 120 * 60 * 60 * 1000).toISOString() },
  { id: "10", type: "update", description: "עודכן סטטוס צ׳ק — הופקד, יוסי מלכה, ₪2,500", timestamp: new Date(Date.now() - 144 * 60 * 60 * 1000).toISOString() },
];

// Mock tenants cleared — real data comes from Supabase
export const mockTenants: {
  id: string; full_name: string; id_number: string; phone: string; email: string | null;
  unit: string; property: string; entity: string; rent: number; balance: number;
  contract_end: string; status: "active" | "expired"; is_active: boolean;
}[] = [];

// --- Tenant Profile Detail Mock Data ---

export interface MockTenantDetail {
  id: string;
  full_name: string;
  id_number: string;
  phone: string;
  whatsapp: string;
  email: string | null;
  unit: string;
  property: string;
  entity: string;
  unit_type: "residential" | "commercial";
  floor: number | null;
  notes: string;
  contract: {
    id: string;
    start_date: string;
    end_date: string;
    monthly_rent: number;
    annual_increase_percent: number;
    building_fee: number;
    arnona: number;
    payment_method: string;
    total_checks: number;
    checks_received: number;
    status: string;
    google_drive_url: string | null;
  };
  payment_schedule: MockPaymentRow[];
  checks: MockCheck[];
  action_logs: MockActionLog[];
}

export interface MockPaymentRow {
  id: string;
  month_year: string;
  expected_amount: number;
  paid_amount: number;
  balance: number;
  payment_date: string | null;
  payment_method: string | null;
  receipt_url: string | null;
  status: "paid" | "partial" | "pending" | "overdue";
  year_number: number;
}

export interface MockCheck {
  id: string;
  check_number: string;
  bank_name: string;
  amount: number;
  for_month: string;
  due_date: string;
  status: "pending" | "deposited" | "bounced" | "cancelled";
}

export interface MockActionLog {
  id: string;
  action: string;
  description: string;
  source: string;
  timestamp: string;
  type: "payment" | "contract" | "message" | "update";
}

export function getMockTenantDetail(id: string): MockTenantDetail | null {
  const tenant = mockTenants.find((t) => t.id === id);
  if (!tenant) return null;

  const startDate = "2025-09-01";
  const rent = tenant.rent;
  const increase = 10;
  const year2Rent = Math.round(rent * 1.1);

  const schedule: MockPaymentRow[] = [];
  const months = [
    "09/2025","10/2025","11/2025","12/2025",
    "01/2026","02/2026","03/2026","04/2026","05/2026","06/2026","07/2026","08/2026",
    "09/2026","10/2026","11/2026","12/2026",
    "01/2027","02/2027","03/2027","04/2027","05/2027","06/2027","07/2027","08/2027",
  ];

  for (let i = 0; i < months.length; i++) {
    const yearNum = i < 12 ? 1 : 2;
    const expected = yearNum === 1 ? rent : year2Rent;
    const isPast = i < 7; // months before April 2026
    const isCurrent = i === 7;
    let status: MockPaymentRow["status"] = "pending";
    let paid = 0;
    let payDate: string | null = null;
    let method: string | null = null;

    if (isPast && tenant.balance >= 0) {
      status = "paid";
      paid = expected;
      payDate = `2025-${String(9 + (i % 12)).padStart(2, "0")}-05`;
      method = "check";
    } else if (isPast && tenant.balance < 0 && i >= 5) {
      status = "overdue";
      paid = 0;
    } else if (isPast) {
      status = "paid";
      paid = expected;
      payDate = `2025-${String(9 + i).padStart(2, "0")}-05`;
      method = "check";
    } else if (isCurrent) {
      status = tenant.balance < 0 ? "overdue" : "pending";
    }

    schedule.push({
      id: `sched-${id}-${i}`,
      month_year: months[i],
      expected_amount: expected,
      paid_amount: paid,
      balance: expected - paid,
      payment_date: payDate,
      payment_method: method,
      receipt_url: paid > 0 ? "#" : null,
      status,
      year_number: yearNum,
    });
  }

  const checks: MockCheck[] = [
    { id: "chk-1", check_number: "1001", bank_name: "לאומי", amount: rent, for_month: "09/2025", due_date: "2025-09-01", status: "deposited" },
    { id: "chk-2", check_number: "1002", bank_name: "לאומי", amount: rent, for_month: "10/2025", due_date: "2025-10-01", status: "deposited" },
    { id: "chk-3", check_number: "1003", bank_name: "לאומי", amount: rent, for_month: "11/2025", due_date: "2025-11-01", status: "deposited" },
    { id: "chk-4", check_number: "1004", bank_name: "לאומי", amount: rent, for_month: "12/2025", due_date: "2025-12-01", status: "deposited" },
    { id: "chk-5", check_number: "1005", bank_name: "לאומי", amount: rent, for_month: "01/2026", due_date: "2026-01-01", status: "deposited" },
    { id: "chk-6", check_number: "1006", bank_name: "לאומי", amount: rent, for_month: "02/2026", due_date: "2026-02-01", status: "deposited" },
    { id: "chk-7", check_number: "1007", bank_name: "לאומי", amount: rent, for_month: "03/2026", due_date: "2026-03-01", status: "deposited" },
    { id: "chk-8", check_number: "1008", bank_name: "לאומי", amount: rent, for_month: "04/2026", due_date: "2026-04-01", status: "pending" },
    { id: "chk-9", check_number: "1009", bank_name: "לאומי", amount: rent, for_month: "05/2026", due_date: "2026-05-01", status: "pending" },
    { id: "chk-10", check_number: "1010", bank_name: "לאומי", amount: rent, for_month: "06/2026", due_date: "2026-06-01", status: "pending" },
    { id: "chk-11", check_number: "1011", bank_name: "לאומי", amount: rent, for_month: "07/2026", due_date: "2026-07-01", status: "pending" },
    { id: "chk-12", check_number: "1012", bank_name: "לאומי", amount: rent, for_month: "08/2026", due_date: "2026-08-01", status: "pending" },
  ];

  const actionLogs: MockActionLog[] = [
    { id: "log-1", action: "payment_recorded", description: `נרשם תשלום ${formatNum(rent)} עבור מרץ 2026`, source: "manual", timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), type: "payment" },
    { id: "log-2", action: "whatsapp_sent", description: "נשלחה תזכורת תשלום בוואטסאפ", source: "whatsapp", timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), type: "message" },
    { id: "log-3", action: "payment_recorded", description: `נרשם תשלום ${formatNum(rent)} עבור פברואר 2026`, source: "manual", timestamp: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(), type: "payment" },
    { id: "log-4", action: "check_deposited", description: `צ׳ק 1006 הופקד — ${formatNum(rent)}`, source: "system", timestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(), type: "update" },
    { id: "log-5", action: "contract_created", description: "חוזה נוצר ונשלח לחתימה", source: "system", timestamp: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), type: "contract" },
    { id: "log-6", action: "contract_signed", description: "חוזה נחתם דיגיטלית — נשמר ב-Google Drive", source: "easydo", timestamp: new Date(Date.now() - 198 * 24 * 60 * 60 * 1000).toISOString(), type: "contract" },
  ];

  return {
    id: tenant.id,
    full_name: tenant.full_name,
    id_number: tenant.id_number,
    phone: tenant.phone,
    whatsapp: tenant.phone,
    email: tenant.email,
    unit: tenant.unit,
    property: tenant.property,
    entity: tenant.entity,
    unit_type: tenant.unit.includes("חנות") || tenant.unit.includes("אורוות") ? "commercial" : "residential",
    floor: tenant.unit.includes("דירה") ? 2 : 0,
    notes: "",
    contract: {
      id: `contract-${id}`,
      start_date: startDate,
      end_date: tenant.contract_end,
      monthly_rent: rent,
      annual_increase_percent: increase,
      building_fee: 400,
      arnona: tenant.unit.includes("חנות") || tenant.unit.includes("אורוות") ? 0 : 500,
      payment_method: "checks",
      total_checks: 12,
      checks_received: 12,
      status: tenant.status,
      google_drive_url: null,
    },
    payment_schedule: schedule,
    checks,
    action_logs: actionLogs,
  };
}

function formatNum(n: number): string {
  return `₪${n.toLocaleString("he-IL")}`;
}
