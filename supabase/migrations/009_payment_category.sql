-- =====================================================
-- 009: Payment category — drives Accountbook document type
--
-- 'rent'      → חשבונית מס/קבלה (TypeCode 320, Osek Murshe)
-- 'arnona'    → קבלה (TypeCode 400)
-- 'utilities' → קבלה (TypeCode 400)
-- 'other'     → קבלה (TypeCode 400)
--
-- Existing payments default to 'rent' so historical receipts can be
-- re-issued with the correct document type.
-- =====================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_category TEXT NOT NULL DEFAULT 'rent';

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_payment_category_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_payment_category_check
  CHECK (payment_category IN ('rent', 'arnona', 'utilities', 'other'));

-- Re-create record_payment_manual_tx with the new p_payment_category arg.
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
  p_created_by TEXT DEFAULT 'manual',
  p_payment_category TEXT DEFAULT 'rent'
) RETURNS UUID AS $$
DECLARE
  v_payment_id UUID;
  v_new_status TEXT;
  v_tenant_name TEXT;
BEGIN
  INSERT INTO payments (
    tenant_id, contract_id, schedule_id, amount,
    payment_date, month_paid_for, payment_method,
    check_number, check_bank, check_date, notes, created_by, payment_category
  ) VALUES (
    p_tenant_id, p_contract_id, p_schedule_id, p_amount,
    p_payment_date, p_month_paid_for, p_payment_method,
    p_check_number, p_check_bank, p_check_date, p_notes, p_created_by, p_payment_category
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

  IF p_payment_method <> 'check' THEN
    SELECT full_name INTO v_tenant_name FROM tenants WHERE id = p_tenant_id;
    INSERT INTO notifications (type, entity_type, entity_id, title, message)
    VALUES (
      'payment_received',
      'payment',
      v_payment_id,
      '💰 תשלום התקבל — ' || COALESCE(v_tenant_name, 'דייר') ||
        ' — ₪' || to_char(p_amount, 'FM999999999.00'),
      'תשלום באמצעות ' || p_payment_method ||
        ' עבור ' || p_month_paid_for ||
        ' נרשם בלוח התשלומים.'
    );
  END IF;

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql;
