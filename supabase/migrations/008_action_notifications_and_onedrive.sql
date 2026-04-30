-- =====================================================
-- 008: Per-action notifications + OneDrive backup settings
--
-- Wires the missing notification events the user expects:
--   • payment received  (cash / transfer — check path already emits
--     `check_recorded` from the application layer)
--   • project created / updated / status changed
--
-- Also seeds settings keys for the new server-side OneDrive backup.
-- =====================================================

-- ─── Payment notifications (manual RPC) ───────────────
-- Re-creates record_payment_manual_tx adding a notifications insert.
-- Skips when payment_method = 'check' because the check pipeline
-- (lib/checks-to-payments.ts) already emits a `check_recorded`
-- notification once the check + payment + receipt are persisted —
-- adding another row here would double-fire.
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
  v_tenant_name TEXT;
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

  -- Per-action notification (cash / transfer / other). Skip 'check' —
  -- the application layer notifies for that with a richer message.
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

-- ─── Payment notifications (WhatsApp-agent RPC) ───────
-- Same change for the older record_payment_tx (used by lib/whatsapp/execute-action.ts).
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
  v_tenant_name TEXT;
BEGIN
  INSERT INTO payments (
    tenant_id, contract_id, schedule_id, amount,
    payment_date, month_paid_for, payment_method,
    check_number, check_bank, notes, created_by
  ) VALUES (
    p_tenant_id, p_contract_id, p_schedule_id, p_amount,
    p_payment_date, p_month_paid_for, p_payment_method,
    p_check_number, p_check_bank, p_notes, 'whatsapp_agent'
  ) RETURNING id INTO v_payment_id;

  IF p_schedule_id IS NOT NULL THEN
    v_new_status := CASE WHEN p_amount >= p_expected_amount THEN 'paid' ELSE 'partial' END;
    UPDATE payment_schedule SET status = v_new_status WHERE id = p_schedule_id;
  END IF;

  INSERT INTO action_logs (entity_type, entity_id, action, description, source, performed_by)
  VALUES ('payment', v_payment_id, 'payment_recorded',
    'תשלום ₪' || p_amount || ' עבור ' || p_month_paid_for,
    'whatsapp', 'whatsapp_agent');

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
        ' נרשם דרך WhatsApp Agent.'
    );
  END IF;

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql;

-- ─── Project notifications (trigger) ──────────────────
-- Fires for INSERT (project_created) and for UPDATEs that change a
-- material field (status, name, total_budget, end_date). Touch-only
-- saves (e.g. updated_at bump with no field change) do not notify.
CREATE OR REPLACE FUNCTION notify_project_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO notifications (type, entity_type, entity_id, title, message)
    VALUES (
      'project_created',
      'project',
      NEW.id,
      '🏗️ פרויקט חדש נפתח — ' || NEW.name,
      'נפתח פרויקט "' || NEW.name || '" בסטטוס ' || COALESCE(NEW.status, 'planning') || '.'
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO notifications (type, entity_type, entity_id, title, message)
      VALUES (
        'project_status_changed',
        'project',
        NEW.id,
        '📌 סטטוס פרויקט עודכן — ' || NEW.name,
        'הפרויקט "' || NEW.name || '" עבר מ-' || COALESCE(OLD.status, '?') ||
          ' ל-' || COALESCE(NEW.status, '?') || '.'
      );
    ELSIF (NEW.name IS DISTINCT FROM OLD.name)
       OR (NEW.total_budget IS DISTINCT FROM OLD.total_budget)
       OR (NEW.end_date IS DISTINCT FROM OLD.end_date)
       OR (NEW.start_date IS DISTINCT FROM OLD.start_date) THEN
      INSERT INTO notifications (type, entity_type, entity_id, title, message)
      VALUES (
        'project_updated',
        'project',
        NEW.id,
        '✏️ פרויקט עודכן — ' || NEW.name,
        'פרטי הפרויקט "' || NEW.name || '" עודכנו.'
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_project_change ON projects;
CREATE TRIGGER trg_notify_project_change
AFTER INSERT OR UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION notify_project_change();

-- ─── OneDrive backup settings ─────────────────────────
-- Default OFF — opt-in once the operator has provisioned a refresh
-- token (see ONEDRIVE_REFRESH_TOKEN env). The Google Drive backup
-- continues to work independently.
INSERT INTO settings (key, value) VALUES
  ('onedrive_backup_enabled', 'false'),
  ('onedrive_backup_folder_name', 'CRM Backups')
ON CONFLICT (key) DO NOTHING;
