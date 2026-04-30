export type AlertPriority = "critical" | "high" | "medium" | "low";

export interface ActivityItem {
  id: string;
  type: "payment" | "contract" | "message" | "update";
  description: string;
  timestamp: string;
}

export interface AlertItem {
  id: string;
  priority: AlertPriority;
  title: string;
  description: string;
  type: string;
  actionLabel?: string;
  actionHref?: string;
}

export interface PaymentScheduleRow {
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

export interface CheckRow {
  id: string;
  check_number: string;
  bank_name: string;
  amount: number;
  for_month: string;
  due_date: string;
  status: "pending" | "deposited" | "bounced" | "cancelled";
}

export interface ActionLogRow {
  id: string;
  action: string;
  description: string;
  source: string;
  timestamp: string;
  type: "payment" | "contract" | "message" | "update";
}

export interface TenantDetail {
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
  payment_schedule: PaymentScheduleRow[];
  checks: CheckRow[];
  action_logs: ActionLogRow[];
}
