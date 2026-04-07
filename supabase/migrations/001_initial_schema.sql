-- =====================================================
-- מערכת ניהול נדל"ן מניב — קבוצת חקיקת
-- סכמת בסיס נתונים ראשונית
-- =====================================================

-- ישויות משפטיות
CREATE TABLE legal_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'company',
  tax_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO legal_entities (name, type) VALUES
  ('חקיקת עסקי/פרטי', 'personal'),
  ('שיא הכרמל מדור בע"מ', 'company'),
  ('נכסי המושבה בע"מ', 'company');

-- מתחמים/אזורים
CREATE TABLE complexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_entity_id UUID REFERENCES legal_entities(id),
  address TEXT,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- נכסים
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  complex_id UUID REFERENCES complexes(id),
  legal_entity_id UUID REFERENCES legal_entities(id),
  secondary_legal_entity_id UUID REFERENCES legal_entities(id),
  dual_entity BOOLEAN DEFAULT FALSE,
  address TEXT,
  city TEXT,
  property_type TEXT DEFAULT 'residential',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- יחידות
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  unit_identifier TEXT NOT NULL,
  unit_type TEXT DEFAULT 'residential',
  floor INTEGER,
  size_sqm NUMERIC,
  is_occupied BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- דיירים
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  id_number TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  email TEXT,
  unit_id UUID REFERENCES units(id),
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- חוזים
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  unit_id UUID REFERENCES units(id),
  legal_entity_id UUID REFERENCES legal_entities(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  monthly_rent NUMERIC NOT NULL,
  annual_increase_percent NUMERIC DEFAULT 0,
  building_fee NUMERIC DEFAULT 0,
  arnona NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT 'checks',
  total_checks INTEGER DEFAULT 12,
  checks_received INTEGER DEFAULT 0,
  google_drive_url TEXT,
  easydo_document_id TEXT,
  status TEXT DEFAULT 'active',
  base_template_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- לוח תשלומים
CREATE TABLE payment_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES contracts(id),
  tenant_id UUID REFERENCES tenants(id),
  month_year TEXT NOT NULL,
  due_date DATE NOT NULL,
  expected_amount NUMERIC NOT NULL,
  year_number INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- תשלומים בפועל
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  contract_id UUID REFERENCES contracts(id),
  schedule_id UUID REFERENCES payment_schedule(id),
  amount NUMERIC NOT NULL,
  payment_date DATE NOT NULL,
  month_paid_for TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  check_number TEXT,
  check_bank TEXT,
  check_date DATE,
  check_deposited BOOLEAN DEFAULT FALSE,
  deposited_date DATE,
  icount_receipt_id TEXT,
  receipt_url TEXT,
  notes TEXT,
  created_by TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- צ'קים
CREATE TABLE checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  contract_id UUID REFERENCES contracts(id),
  payment_id UUID REFERENCES payments(id),
  check_number TEXT NOT NULL,
  bank_name TEXT,
  branch_number TEXT,
  account_number TEXT,
  amount NUMERIC NOT NULL,
  due_date DATE NOT NULL,
  for_month TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  deposited_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- חשבוניות וקבלות
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  payment_id UUID REFERENCES payments(id),
  legal_entity_id UUID REFERENCES legal_entities(id),
  icount_id TEXT,
  invoice_type TEXT DEFAULT 'receipt',
  amount NUMERIC NOT NULL,
  issue_date DATE NOT NULL,
  pdf_url TEXT,
  status TEXT DEFAULT 'issued',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- פרויקטים
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_entity_id UUID REFERENCES legal_entities(id),
  address TEXT,
  description TEXT,
  total_budget NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'planning',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ספקים
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- הוצאות פרויקט
CREATE TABLE project_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  supplier_id UUID REFERENCES suppliers(id),
  supplier_name TEXT,
  description TEXT,
  amount NUMERIC NOT NULL,
  invoice_date DATE,
  due_date DATE,
  status TEXT DEFAULT 'unpaid',
  invoice_image_url TEXT,
  invoice_number TEXT,
  notes TEXT,
  created_by TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- לוג פעולות
CREATE TABLE action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  ai_summary TEXT,
  source TEXT DEFAULT 'manual',
  performed_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- התראות
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- הגדרות מערכת
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('contract_alert_days_1', '45'),
  ('contract_alert_days_2', '30'),
  ('payment_due_day', '10'),
  ('check_alert_days', '7'),
  ('supplier_invoice_alert_days', '30'),
  ('business_name', 'קבוצת חקיקת'),
  ('wati_api_key', ''),
  ('wati_base_url', ''),
  ('icount_api_key', ''),
  ('icount_company_id', ''),
  ('google_drive_root_folder_id', ''),
  ('easydo_api_key', ''),
  ('claude_api_key', ''),
  ('whatsapp_agent_number', '');

-- Indexes
CREATE INDEX idx_tenants_unit ON tenants(unit_id);
CREATE INDEX idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_end_date ON contracts(end_date);
CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_month ON payments(month_paid_for);
CREATE INDEX idx_payment_schedule_tenant ON payment_schedule(tenant_id);
CREATE INDEX idx_payment_schedule_status ON payment_schedule(status);
CREATE INDEX idx_checks_due_date ON checks(due_date);
CREATE INDEX idx_checks_status ON checks(status);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_action_logs_entity ON action_logs(entity_type, entity_id);
