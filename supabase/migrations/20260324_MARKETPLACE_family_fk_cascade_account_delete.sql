-- Allow deleting a family row when marketplace rows exist (account deletion).
-- Previously marketplace_listings / marketplace_purchases used REFERENCES family(id) without CASCADE.

-- marketplace_purchases.family_id → CASCADE on family delete
ALTER TABLE marketplace_purchases
  DROP CONSTRAINT IF EXISTS marketplace_purchases_family_id_fkey;
ALTER TABLE marketplace_purchases
  ADD CONSTRAINT marketplace_purchases_family_id_fkey
  FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE;

-- marketplace_listings.family_id → CASCADE on family delete
ALTER TABLE marketplace_listings
  DROP CONSTRAINT IF EXISTS marketplace_listings_family_id_fkey;
ALTER TABLE marketplace_listings
  ADD CONSTRAINT marketplace_listings_family_id_fkey
  FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE;
