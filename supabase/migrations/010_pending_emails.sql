-- =====================================================
-- 010: Pending emails queue
--
-- Persists outbound emails that failed to send (SMTP unavailable, transient
-- network error, etc.) so a background retry loop can re-try them later.
-- The retry loop runs from the Next.js server process (no pg-boss needed)
-- so this works on Render without DATABASE_URL.
-- =====================================================

CREATE TABLE IF NOT EXISTS pending_emails (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email      TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body_text     TEXT NOT NULL,
  body_html     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  attempts      INT  NOT NULL DEFAULT 0,
  last_error    TEXT,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Retry loop selects: status='pending' AND next_retry_at <= now()
CREATE INDEX IF NOT EXISTS pending_emails_due_idx
  ON pending_emails (next_retry_at)
  WHERE status = 'pending';

-- Persist the EasyDo signer URL on the contract so the operator can always
-- copy/share the signing link from the UI (independent of whether the
-- automated email reached the tenant).
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS easydo_fill_url TEXT;
