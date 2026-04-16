-- =====================================================
-- פעולות ממתינות לאישור — confirmation flow for WhatsApp
-- =====================================================

CREATE TABLE pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  sender_name TEXT,
  action TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  confirmation_message TEXT,
  status TEXT DEFAULT 'pending',  -- pending | confirmed | rejected | expired
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX idx_pending_actions_phone ON pending_actions(phone);
CREATE INDEX idx_pending_actions_status ON pending_actions(status);
CREATE INDEX idx_pending_actions_expires ON pending_actions(expires_at);
