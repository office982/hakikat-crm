-- =====================================================
-- 007: Link tenants to Accountbook clients.
-- The Accountbook API does not expose a client-create endpoint, so
-- clients must already exist in their web UI. This column maps each
-- tenant to its corresponding ClientNumber. When NULL, documents fall
-- back to ClientNumber=200000 ("random client").
-- =====================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS accountbook_client_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_tenants_accountbook_client_number
  ON tenants(accountbook_client_number)
  WHERE accountbook_client_number IS NOT NULL;
