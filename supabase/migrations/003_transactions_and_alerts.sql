-- =====================================================
-- 003: Transaction functions + alert helpers
-- =====================================================

-- ─── Idempotency: prevent double-execution of pending actions ───
ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- ─── RPC: Record payment atomically ────────────────────────────
CREATE OR REPLACE FUNCTION record_payment_tx(
  p_tenant_id UUID,
  p_contract_id UUID,
  p_schedule_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_month_paid_for TEXT,
  p_payment_method TEXT,
  p_check_number TEXT DEFAULT NULL,
  p_check_bank TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_expected_amount NUMERIC DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_payment_id UUID;
  v_new_status TEXT;
BEGIN
  -- Insert payment
  INSERT INTO payments (
    tenant_id, contract_id, schedule_id, amount,
    payment_date, month_paid_for, payment_method,
    check_number, check_bank, notes, created_by
  ) VALUES (
    p_tenant_id, p_contract_id, p_schedule_id, p_amount,
    p_payment_date, p_month_paid_for, p_payment_method,
    p_check_number, p_check_bank, p_notes, 'whatsapp_agent'
  ) RETURNING id INTO v_payment_id;

  -- Update schedule status
  IF p_schedule_id IS NOT NULL THEN
    v_new_status := CASE WHEN p_amount >= p_expected_amount THEN 'paid' ELSE 'partial' END;
    UPDATE payment_schedule SET status = v_new_status WHERE id = p_schedule_id;
  END IF;

  -- Log
  INSERT INTO action_logs (entity_type, entity_id, action, description, source, performed_by)
  VALUES ('payment', v_payment_id, 'payment_recorded',
    'תשלום ₪' || p_amount || ' עבור ' || p_month_paid_for,
    'whatsapp', 'whatsapp_agent');

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql;

-- ─── RPC: Create contract atomically ───────────────────────────
CREATE OR REPLACE FUNCTION create_contract_tx(
  p_tenant_id UUID,
  p_unit_id UUID,
  p_legal_entity_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_monthly_rent NUMERIC,
  p_annual_increase NUMERIC DEFAULT 0,
  p_building_fee NUMERIC DEFAULT 0,
  p_arnona NUMERIC DEFAULT 0,
  p_schedule JSONB DEFAULT '[]'::JSONB
) RETURNS UUID AS $$
DECLARE
  v_contract_id UUID;
  v_row JSONB;
BEGIN
  -- Create contract
  INSERT INTO contracts (
    tenant_id, unit_id, legal_entity_id,
    start_date, end_date, monthly_rent,
    annual_increase_percent, building_fee, arnona,
    payment_method, total_checks, status
  ) VALUES (
    p_tenant_id, p_unit_id, p_legal_entity_id,
    p_start_date, p_end_date, p_monthly_rent,
    p_annual_increase, p_building_fee, p_arnona,
    'checks', 12, 'pending_signature'
  ) RETURNING id INTO v_contract_id;

  -- Insert payment schedule rows
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_schedule)
  LOOP
    INSERT INTO payment_schedule (contract_id, tenant_id, month_year, due_date, expected_amount, year_number, status)
    VALUES (
      v_contract_id,
      p_tenant_id,
      v_row->>'month_year',
      (v_row->>'due_date')::DATE,
      (v_row->>'expected_amount')::NUMERIC,
      COALESCE((v_row->>'year_number')::INTEGER, 1),
      'pending'
    );
  END LOOP;

  -- Mark unit occupied
  IF p_unit_id IS NOT NULL THEN
    UPDATE units SET is_occupied = true WHERE id = p_unit_id;
  END IF;

  -- Log
  INSERT INTO action_logs (entity_type, entity_id, action, description, source, performed_by)
  VALUES ('contract', v_contract_id, 'contract_created',
    'חוזה חדש — ₪' || p_monthly_rent || '/חודש',
    'whatsapp', 'whatsapp_agent');

  RETURN v_contract_id;
END;
$$ LANGUAGE plpgsql;

-- ─── RPC: Expire old pending actions ───────────────────────────
CREATE OR REPLACE FUNCTION expire_pending_actions() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE pending_actions
  SET status = 'expired', resolved_at = NOW()
  WHERE status = 'pending' AND expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ─── Deduplication index for notifications ─────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_dedup
  ON notifications(type, entity_id, DATE(created_at));
