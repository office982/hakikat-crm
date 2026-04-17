-- =====================================================
-- 004: Features 2–10
--   Notifications extensions, EasyDo flow, auto-receipts,
--   contract renewal, bounced-check full flow, reliability
--   rating, drive backups.
-- =====================================================

-- ─── Tenant reliability score ──────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS reliability_score NUMERIC DEFAULT 100,
  ADD COLUMN IF NOT EXISTS reliability_computed_at TIMESTAMPTZ;

-- ─── Contract lineage (renewal chain) ──────────────────
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS renewed_from UUID REFERENCES contracts(id),
  ADD COLUMN IF NOT EXISTS renewed_to UUID REFERENCES contracts(id);

-- ─── Check replacements (bounced → new) ────────────────
ALTER TABLE checks
  ADD COLUMN IF NOT EXISTS replacement_for UUID REFERENCES checks(id),
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_checks_replacement ON checks(replacement_for);

-- ─── Invoice tracking on payments (for auto-receipts) ──
-- `payments.icount_receipt_id` and `payments.receipt_url` already exist.
-- Add a `receipt_doc_number` for the human-readable docnum:
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS receipt_doc_number INTEGER,
  ADD COLUMN IF NOT EXISTS receipt_issue_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_issue_error TEXT;

-- ─── Drive backups tracking ────────────────────────────
CREATE TABLE IF NOT EXISTS drive_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,             -- 'snapshot' | 'contract'
  file_id TEXT,                   -- google drive id
  file_url TEXT,
  size_bytes BIGINT,
  tables_included TEXT[],
  rows_included INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drive_backups_created ON drive_backups(created_at DESC);

-- ─── RPC: Bounce a check atomically ────────────────────
-- Marks check as bounced, reverts schedule to overdue,
-- decrements checks_received on contract, logs the event.
-- Returns JSON { check_id, schedule_id }.
CREATE OR REPLACE FUNCTION bounce_check_tx(
  p_tenant_id UUID,
  p_for_month TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_check_id UUID;
  v_schedule_id UUID;
  v_contract_id UUID;
  v_amount NUMERIC;
BEGIN
  -- Find check (latest pending/deposited for that month)
  SELECT id, amount, contract_id INTO v_check_id, v_amount, v_contract_id
  FROM checks
  WHERE tenant_id = p_tenant_id
    AND for_month = p_for_month
    AND status IN ('pending', 'deposited')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_check_id IS NOT NULL THEN
    UPDATE checks
      SET status = 'bounced',
          bounced_at = NOW(),
          notes = COALESCE(p_reason, notes)
      WHERE id = v_check_id;

    IF v_contract_id IS NOT NULL THEN
      UPDATE contracts
        SET checks_received = GREATEST(checks_received - 1, 0)
        WHERE id = v_contract_id;
    END IF;
  END IF;

  -- Revert matching schedule row to overdue
  SELECT id INTO v_schedule_id
  FROM payment_schedule
  WHERE tenant_id = p_tenant_id AND month_year = p_for_month
  LIMIT 1;

  IF v_schedule_id IS NOT NULL THEN
    UPDATE payment_schedule SET status = 'overdue' WHERE id = v_schedule_id;
  END IF;

  INSERT INTO action_logs (entity_type, entity_id, action, description, source, performed_by)
  VALUES (
    'check',
    COALESCE(v_check_id, p_tenant_id),
    'check_bounced',
    'צ''ק חוזר — ' || p_for_month || COALESCE(' (₪' || v_amount || ')', ''),
    'system',
    'system'
  );

  RETURN jsonb_build_object(
    'check_id', v_check_id,
    'schedule_id', v_schedule_id,
    'amount', v_amount
  );
END;
$$ LANGUAGE plpgsql;

-- ─── RPC: Record a manual payment atomically ───────────
-- Same as record_payment_tx but supports `created_by` parameter
-- (so the UI can register as 'manual' and WhatsApp as 'whatsapp_agent'),
-- and returns the payment row id.
CREATE OR REPLACE FUNCTION record_payment_manual_tx(
  p_tenant_id UUID,
  p_contract_id UUID,
  p_schedule_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_month_paid_for TEXT,
  p_payment_method TEXT,
  p_check_number TEXT DEFAULT NULL,
  p_check_bank TEXT DEFAULT NULL,
  p_check_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_expected_amount NUMERIC DEFAULT 0,
  p_created_by TEXT DEFAULT 'manual'
) RETURNS UUID AS $$
DECLARE
  v_payment_id UUID;
  v_new_status TEXT;
BEGIN
  INSERT INTO payments (
    tenant_id, contract_id, schedule_id, amount,
    payment_date, month_paid_for, payment_method,
    check_number, check_bank, check_date, notes, created_by
  ) VALUES (
    p_tenant_id, p_contract_id, p_schedule_id, p_amount,
    p_payment_date, p_month_paid_for, p_payment_method,
    p_check_number, p_check_bank, p_check_date, p_notes, p_created_by
  ) RETURNING id INTO v_payment_id;

  IF p_schedule_id IS NOT NULL THEN
    v_new_status := CASE WHEN p_amount >= p_expected_amount THEN 'paid' ELSE 'partial' END;
    UPDATE payment_schedule SET status = v_new_status WHERE id = p_schedule_id;
  END IF;

  INSERT INTO action_logs (entity_type, entity_id, action, description, source, performed_by)
  VALUES (
    'payment', v_payment_id, 'payment_recorded',
    'תשלום ₪' || p_amount || ' עבור ' || p_month_paid_for,
    p_created_by, p_created_by
  );

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql;

-- ─── RPC: Renew a contract atomically ──────────────────
-- Creates a new contract starting the day after the current one ends,
-- with the current rent compounded by the inherited annual_increase
-- or the explicit new_rent, inherits building_fee / arnona / unit /
-- legal_entity, generates payment schedule, links the two contracts.
-- Does NOT mark new contract active — starts as 'pending_signature'.
CREATE OR REPLACE FUNCTION renew_contract_tx(
  p_old_contract_id UUID,
  p_new_rent NUMERIC,            -- pass monthly_rent * (1+pct) if caller wants default bump
  p_months INTEGER DEFAULT 12,
  p_schedule JSONB DEFAULT '[]'::JSONB
) RETURNS UUID AS $$
DECLARE
  v_old RECORD;
  v_new_contract_id UUID;
  v_new_start DATE;
  v_new_end DATE;
  v_row JSONB;
BEGIN
  SELECT * INTO v_old FROM contracts WHERE id = p_old_contract_id;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'Contract not found'; END IF;

  v_new_start := v_old.end_date + INTERVAL '1 day';
  v_new_end := v_new_start + (p_months || ' months')::INTERVAL - INTERVAL '1 day';

  INSERT INTO contracts (
    tenant_id, unit_id, legal_entity_id,
    start_date, end_date, monthly_rent,
    annual_increase_percent, building_fee, arnona,
    payment_method, total_checks, status,
    renewed_from
  ) VALUES (
    v_old.tenant_id, v_old.unit_id, v_old.legal_entity_id,
    v_new_start, v_new_end, p_new_rent,
    v_old.annual_increase_percent, v_old.building_fee, v_old.arnona,
    v_old.payment_method, p_months, 'pending_signature',
    v_old.id
  ) RETURNING id INTO v_new_contract_id;

  UPDATE contracts SET renewed_to = v_new_contract_id WHERE id = v_old.id;

  -- Insert payment schedule
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_schedule)
  LOOP
    INSERT INTO payment_schedule (contract_id, tenant_id, month_year, due_date, expected_amount, year_number, status)
    VALUES (
      v_new_contract_id,
      v_old.tenant_id,
      v_row->>'month_year',
      (v_row->>'due_date')::DATE,
      (v_row->>'expected_amount')::NUMERIC,
      COALESCE((v_row->>'year_number')::INTEGER, 1),
      'pending'
    );
  END LOOP;

  INSERT INTO action_logs (entity_type, entity_id, action, description, source, performed_by)
  VALUES (
    'contract', v_new_contract_id, 'contract_renewed',
    'חידוש חוזה — ₪' || p_new_rent || '/חודש, ' || v_new_start || ' עד ' || v_new_end,
    'system', 'system'
  );

  RETURN v_new_contract_id;
END;
$$ LANGUAGE plpgsql;

-- ─── RPC: EasyDo post-signing completion ───────────────
-- Atomically: activate contract, mark unit occupied,
-- increment checks_received, log. Called from webhook.
CREATE OR REPLACE FUNCTION complete_contract_signing(
  p_easydo_document_id TEXT,
  p_drive_url TEXT
) RETURNS UUID AS $$
DECLARE
  v_contract_id UUID;
  v_unit_id UUID;
BEGIN
  SELECT id, unit_id INTO v_contract_id, v_unit_id
  FROM contracts
  WHERE easydo_document_id = p_easydo_document_id
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    RAISE EXCEPTION 'No contract found for document %', p_easydo_document_id;
  END IF;

  UPDATE contracts
    SET status = 'active',
        google_drive_url = COALESCE(p_drive_url, google_drive_url),
        updated_at = NOW()
    WHERE id = v_contract_id;

  IF v_unit_id IS NOT NULL THEN
    UPDATE units SET is_occupied = TRUE WHERE id = v_unit_id;
  END IF;

  INSERT INTO action_logs (entity_type, entity_id, action, description, source, performed_by)
  VALUES (
    'contract', v_contract_id, 'contract_signed',
    'חוזה נחתם דיגיטלית דרך EasyDo',
    'easydo', 'easydo'
  );

  RETURN v_contract_id;
END;
$$ LANGUAGE plpgsql;

-- ─── RPC: Compute reliability scores for all tenants ───
-- Score formula (0-100):
--   base = 100
--   − 10 * (paid_late_count / total_schedule_count)    [lateness]
--   − 20 * (overdue_count / total_schedule_count)      [currently overdue]
--   − 15 * (bounced_count / 12)                        [bounced checks]
-- Clamped to [0, 100]. Tenants with no history stay at 100.
CREATE OR REPLACE FUNCTION compute_reliability_scores() RETURNS INTEGER AS $$
DECLARE
  v_tenant RECORD;
  v_total INTEGER;
  v_paid INTEGER;
  v_overdue INTEGER;
  v_bounced INTEGER;
  v_score NUMERIC;
  v_count INTEGER := 0;
BEGIN
  FOR v_tenant IN SELECT id FROM tenants WHERE is_active = TRUE LOOP
    SELECT COUNT(*) INTO v_total
      FROM payment_schedule
      WHERE tenant_id = v_tenant.id AND due_date <= CURRENT_DATE;

    IF v_total = 0 THEN
      UPDATE tenants
        SET reliability_score = 100, reliability_computed_at = NOW()
        WHERE id = v_tenant.id;
      v_count := v_count + 1;
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO v_paid
      FROM payment_schedule
      WHERE tenant_id = v_tenant.id AND status = 'paid';

    SELECT COUNT(*) INTO v_overdue
      FROM payment_schedule
      WHERE tenant_id = v_tenant.id AND status IN ('overdue', 'partial');

    SELECT COUNT(*) INTO v_bounced
      FROM checks
      WHERE tenant_id = v_tenant.id AND status = 'bounced';

    v_score := 100
      - LEAST(40, 20.0 * v_overdue / NULLIF(v_total, 0))
      - LEAST(40, 15.0 * v_bounced)  -- 1 bounced = -15, clamped
      - LEAST(20, 10.0 * GREATEST(v_total - v_paid - v_overdue, 0) / NULLIF(v_total, 0));

    v_score := GREATEST(0, LEAST(100, v_score));

    UPDATE tenants
      SET reliability_score = ROUND(v_score),
          reliability_computed_at = NOW()
      WHERE id = v_tenant.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ─── Settings seed for feature toggles ─────────────────
INSERT INTO settings (key, value) VALUES
  ('auto_issue_receipts', 'true'),
  ('drive_backup_enabled', 'true'),
  ('drive_backup_folder_id', ''),
  ('weekly_report_day', '0'),   -- Sunday
  ('reliability_alert_threshold', '60')
ON CONFLICT (key) DO NOTHING;
