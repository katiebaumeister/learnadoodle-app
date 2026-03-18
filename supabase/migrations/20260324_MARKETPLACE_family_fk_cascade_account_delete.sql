-- Allow deleting a family row when marketplace rows exist (account deletion).
-- Skips safely if marketplace tables were never created (social migration not applied).

DO $$
BEGIN
  IF to_regclass('public.marketplace_purchases') IS NOT NULL THEN
    ALTER TABLE marketplace_purchases
      DROP CONSTRAINT IF EXISTS marketplace_purchases_family_id_fkey;
    ALTER TABLE marketplace_purchases
      ADD CONSTRAINT marketplace_purchases_family_id_fkey
      FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE;
  END IF;
  IF to_regclass('public.marketplace_listings') IS NOT NULL THEN
    ALTER TABLE marketplace_listings
      DROP CONSTRAINT IF EXISTS marketplace_listings_family_id_fkey;
    ALTER TABLE marketplace_listings
      ADD CONSTRAINT marketplace_listings_family_id_fkey
      FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE;
  END IF;
END $$;
