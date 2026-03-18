-- Purchases reference listings; optional CASCADE when listing is deleted.
-- Skips if marketplace tables do not exist.

DO $$
BEGIN
  IF to_regclass('public.marketplace_purchases') IS NOT NULL
     AND to_regclass('public.marketplace_listings') IS NOT NULL THEN
    ALTER TABLE marketplace_purchases
      DROP CONSTRAINT IF EXISTS marketplace_purchases_listing_id_fkey;
    ALTER TABLE marketplace_purchases
      ADD CONSTRAINT marketplace_purchases_listing_id_fkey
      FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE;
  END IF;
END $$;
