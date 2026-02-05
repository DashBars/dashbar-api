-- AlterTable: add optional bar_id to event_price for per-bar price overrides
ALTER TABLE "event_price" ADD COLUMN "bar_id" INTEGER;

-- Add FK: bar_id -> bar(id) ON DELETE CASCADE
ALTER TABLE "event_price" ADD CONSTRAINT "event_price_bar_id_fkey"
  FOREIGN KEY ("bar_id") REFERENCES "Bar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop existing unique (event_id, cocktail_id)
ALTER TABLE "event_price" DROP CONSTRAINT IF EXISTS "event_price_event_id_cocktail_id_key";

-- One event-level price per (event_id, cocktail_id) when bar_id IS NULL
CREATE UNIQUE INDEX "event_price_event_id_cocktail_id_bar_id_key"
  ON "event_price"("event_id", "cocktail_id") WHERE "bar_id" IS NULL;

-- One per-bar price per (event_id, cocktail_id, bar_id) when bar_id IS NOT NULL
CREATE UNIQUE INDEX "event_price_event_id_cocktail_id_bar_id_bar_key"
  ON "event_price"("event_id", "cocktail_id", "bar_id") WHERE "bar_id" IS NOT NULL;
