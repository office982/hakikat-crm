-- =====================================================
-- 006: Add landlord_name to legal_entities.
-- Used as the contractual landlord display name on lease
-- documents (may differ from the entity's legal name).
-- =====================================================

ALTER TABLE legal_entities
  ADD COLUMN IF NOT EXISTS landlord_name TEXT;
