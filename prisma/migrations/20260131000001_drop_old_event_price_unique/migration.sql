-- Drop old unique constraint (event_id, cocktail_id) if it still exists.
-- Required for per-bar prices: we now use (event_id, cocktail_id, bar_id) with partial indexes.
ALTER TABLE "event_price" DROP CONSTRAINT IF EXISTS "event_price_event_id_cocktail_id_key";
