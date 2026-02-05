-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('upcoming', 'active', 'finished', 'archived');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "status" "EventStatus" NOT NULL DEFAULT 'upcoming';
ALTER TABLE "Event" ADD COLUMN "scheduled_start_at" TIMESTAMP;
ALTER TABLE "Event" ADD COLUMN "archived_at" TIMESTAMP;

-- Migrate existing data: calculate status from startedAt/finishedAt
UPDATE "Event" 
SET "status" = CASE
  WHEN "finished_at" IS NOT NULL THEN 'finished'::"EventStatus"
  WHEN "started_at" IS NOT NULL AND "started_at" <= NOW() THEN 'active'::"EventStatus"
  ELSE 'upcoming'::"EventStatus"
END,
"scheduled_start_at" = "started_at" WHERE "started_at" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- AlterTable: Set default status for Bar
ALTER TABLE "Bar" ALTER COLUMN "status" SET DEFAULT 'closed';
