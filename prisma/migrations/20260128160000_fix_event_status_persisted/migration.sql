-- Fix migration: ensure persisted Event.status exists (and related columns)
-- This is intentionally idempotent to recover from previously "applied" migrations
-- that were marked as applied but did not actually execute against the target DB.

-- 1) Ensure enum exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventStatus') THEN
    CREATE TYPE "EventStatus" AS ENUM ('upcoming', 'active', 'finished', 'archived');
  END IF;
END $$;

-- 2) Ensure columns exist
ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "status" "EventStatus",
  ADD COLUMN IF NOT EXISTS "scheduled_start_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP;

-- 3) If status column exists but is the wrong type, coerce it
DO $$
DECLARE
  status_udt text;
BEGIN
  SELECT c.udt_name INTO status_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'Event'
    AND c.column_name = 'status';

  IF status_udt IS NOT NULL AND status_udt <> 'EventStatus' THEN
    ALTER TABLE "Event"
      ALTER COLUMN "status" TYPE "EventStatus"
      USING ("status"::text::"EventStatus");
  END IF;
END $$;

-- 4) Backfill status and scheduled_start_at if needed
UPDATE "Event"
SET
  "status" = COALESCE(
    "status",
    CASE
      WHEN "finished_at" IS NOT NULL THEN 'finished'::"EventStatus"
      WHEN "started_at" IS NOT NULL AND "started_at" <= NOW() THEN 'active'::"EventStatus"
      ELSE 'upcoming'::"EventStatus"
    END
  ),
  "scheduled_start_at" = COALESCE("scheduled_start_at", "started_at")
WHERE "status" IS NULL OR "scheduled_start_at" IS NULL;

-- 5) Enforce default + NOT NULL on status
ALTER TABLE "Event"
  ALTER COLUMN "status" SET DEFAULT 'upcoming';

UPDATE "Event" SET "status" = 'upcoming'::"EventStatus" WHERE "status" IS NULL;

ALTER TABLE "Event"
  ALTER COLUMN "status" SET NOT NULL;

-- 6) Ensure index exists
CREATE INDEX IF NOT EXISTS "Event_status_idx" ON "Event"("status");

