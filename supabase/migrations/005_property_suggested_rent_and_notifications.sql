-- =====================================================
-- 005: Spec gaps — suggested_rent on properties,
--      notification delivery tracking + retry queue,
--      vendor (supplier) usability indices.
-- =====================================================

-- ─── properties.suggested_rent ─────────────────────────
-- Recommended monthly rent for the property (₪). Used by the
-- WhatsApp agent and the property modal for pricing decisions.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS suggested_rent NUMERIC;

-- ─── notification delivery tracking ────────────────────
-- Track whether a notification was actually delivered through
-- a channel (whatsapp/email/sms/push), retry attempts, and
-- the failure reason if any. The notifications row stays as
-- the canonical record; per-channel attempts go to
-- notification_attempts.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS recipient TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';

CREATE INDEX IF NOT EXISTS idx_notifications_delivery_status
  ON notifications(delivery_status)
  WHERE delivery_status IN ('pending', 'failed');

-- Per-channel attempt log. One row per send attempt, used to
-- power the retry job and the audit trail in the dashboard.
CREATE TABLE IF NOT EXISTS notification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,            -- 'whatsapp' | 'email' | 'sms' | 'push'
  recipient TEXT NOT NULL,
  status TEXT NOT NULL,             -- 'sent' | 'failed'
  error TEXT,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_attempts_notification
  ON notification_attempts(notification_id);

-- ─── suppliers usability ───────────────────────────────
-- Add an index for case-insensitive lookups by name (used
-- by the WhatsApp expense flow and the suppliers list).
CREATE INDEX IF NOT EXISTS idx_suppliers_name_lower
  ON suppliers(LOWER(name));

-- ─── settings seed for new fallback channels ──────────
INSERT INTO settings (key, value) VALUES
  ('notification_email_enabled', 'false'),
  ('notification_sms_enabled', 'false'),
  ('payment_reminder_days_before', '3'),
  ('drive_backup_checks_enabled', 'true'),
  ('drive_backup_receipts_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
