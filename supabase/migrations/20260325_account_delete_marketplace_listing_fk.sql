-- Purchases reference listings; listing must delete only after all purchases for that listing are gone.
-- Also allow listing delete to cascade purchases when family is deleted (optional).
ALTER TABLE marketplace_purchases
  DROP CONSTRAINT IF EXISTS marketplace_purchases_listing_id_fkey;
ALTER TABLE marketplace_purchases
  ADD CONSTRAINT marketplace_purchases_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE;
