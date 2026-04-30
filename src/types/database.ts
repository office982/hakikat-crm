export interface LegalEntity {
  id: string;
  name: string;
  type: "company" | "personal";
  tax_id: string | null;
  landlord_name: string | null;
  created_at: string;
}

export interface Complex {
  id: string;
  name: string;
  legal_entity_id: string;
  address: string | null;
  city: string | null;
  created_at: string;
  legal_entity?: LegalEntity;
}

export interface Property {
  id: string;
  name: string;
  complex_id: string;
  legal_entity_id: string;
  secondary_legal_entity_id: string | null;
  dual_entity: boolean;
  address: string | null;
  city: string | null;
  property_type: "residential" | "commercial" | "mixed";
  suggested_rent: number | null;
  created_at: string;
  complex?: Complex;
  legal_entity?: LegalEntity;
}

export interface Unit {
  id: string;
  property_id: string;
  unit_identifier: string;
  unit_type: "residential" | "commercial";
  floor: number | null;
  size_sqm: number | null;
  is_occupied: boolean;
  notes: string | null;
  created_at: string;
  property?: Property;
}

export interface Tenant {
  id: string;
  full_name: string;
  id_number: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  unit_id: string | null;
  is_active: boolean;
  notes: string | null;
  reliability_score: number;
  reliability_computed_at: string | null;
  accountbook_client_number: number | null;
  created_at: string;
  updated_at: string;
  unit?: Unit;
  contracts?: Contract[];
}

export interface Contract {
  id: string;
  tenant_id: string;
  unit_id: string;
  legal_entity_id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  annual_increase_percent: number;
  building_fee: number;
  arnona: number;
  payment_method: "checks" | "transfer" | "cash";
  total_checks: number;
  checks_received: number;
  google_drive_url: string | null;
  easydo_document_id: string | null;
  status: "active" | "pending_signature" | "expired" | "cancelled";
  base_template_used: string | null;
  renewed_from: string | null;
  renewed_to: string | null;
  created_at: string;
  updated_at: string;
  tenant?: Tenant;
  unit?: Unit;
  legal_entity?: LegalEntity;
  payment_schedule?: PaymentSchedule[];
}

export interface PaymentSchedule {
  id: string;
  contract_id: string;
  tenant_id: string;
  month_year: string;
  due_date: string;
  expected_amount: number;
  year_number: number;
  status: "pending" | "paid" | "partial" | "overdue";
  created_at: string;
}

export interface Payment {
  id: string;
  tenant_id: string;
  contract_id: string;
  schedule_id: string | null;
  amount: number;
  payment_date: string;
  month_paid_for: string;
  payment_method: "check" | "transfer" | "cash";
  check_number: string | null;
  check_bank: string | null;
  check_date: string | null;
  check_deposited: boolean;
  deposited_date: string | null;
  icount_receipt_id: string | null;
  receipt_url: string | null;
  receipt_doc_number: number | null;
  receipt_issue_attempted_at: string | null;
  receipt_issue_error: string | null;
  notes: string | null;
  created_by: "manual" | "whatsapp_agent" | "system";
  created_at: string;
  tenant?: Tenant;
}

export interface Check {
  id: string;
  tenant_id: string;
  contract_id: string;
  payment_id: string | null;
  check_number: string;
  bank_name: string | null;
  branch_number: string | null;
  account_number: string | null;
  amount: number;
  due_date: string;
  for_month: string;
  status: "pending" | "deposited" | "bounced" | "cancelled";
  deposited_date: string | null;
  notes: string | null;
  replacement_for: string | null;
  bounced_at: string | null;
  created_at: string;
  tenant?: Tenant;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  payment_id: string;
  legal_entity_id: string;
  icount_id: string | null;
  invoice_type: "receipt" | "invoice" | "invoice_receipt";
  amount: number;
  issue_date: string;
  pdf_url: string | null;
  status: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  legal_entity_id: string;
  address: string | null;
  description: string | null;
  total_budget: number;
  status: "planning" | "active" | "completed";
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  legal_entity?: LegalEntity;
  expenses?: ProjectExpense[];
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
}

export interface ProjectExpense {
  id: string;
  project_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  description: string | null;
  amount: number;
  invoice_date: string | null;
  due_date: string | null;
  status: "unpaid" | "paid" | "partial";
  invoice_image_url: string | null;
  invoice_number: string | null;
  notes: string | null;
  created_by: "manual" | "whatsapp_agent";
  created_at: string;
}

export interface ActionLog {
  id: string;
  entity_type: "tenant" | "contract" | "payment" | "project" | "check";
  entity_id: string;
  action: string;
  description: string | null;
  ai_summary: string | null;
  source: "manual" | "whatsapp" | "system" | "easydo";
  performed_by: string;
  created_at: string;
}

export interface Notification {
  id: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  message: string | null;
  is_read: boolean;
  due_date: string | null;
  delivery_status: "pending" | "sent" | "failed" | "delivered" | null;
  sent_at: string | null;
  failed_at: string | null;
  retry_count: number;
  last_error: string | null;
  recipient: string | null;
  channel: "whatsapp" | "email" | "sms" | "push" | null;
  created_at: string;
}

export interface NotificationAttempt {
  id: string;
  notification_id: string;
  channel: "whatsapp" | "email" | "sms" | "push";
  recipient: string;
  status: "sent" | "failed";
  error: string | null;
  attempted_at: string;
}

export interface Setting {
  key: string;
  value: string | null;
  updated_at: string;
}

export interface PendingAction {
  id: string;
  phone: string;
  sender_name: string | null;
  action: string;
  data: Record<string, unknown>;
  confirmation_message: string | null;
  status: "pending" | "confirmed" | "rejected" | "expired";
  resolved_at: string | null;
  created_at: string;
  expires_at: string;
}
