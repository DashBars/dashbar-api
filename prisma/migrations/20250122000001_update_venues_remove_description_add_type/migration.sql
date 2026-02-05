-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('outdoor', 'indoor', 'nose');

-- AlterTable: Remove description
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "description";

-- AlterTable: Add new fields
ALTER TABLE "Venue" ADD COLUMN "address_line_2" TEXT;
ALTER TABLE "Venue" ADD COLUMN "state" TEXT;
ALTER TABLE "Venue" ADD COLUMN "postal_code" TEXT;
ALTER TABLE "Venue" ADD COLUMN "venue_type" "VenueType" NOT NULL DEFAULT 'nose';
ALTER TABLE "Venue" ADD COLUMN "place_id" TEXT UNIQUE;
ALTER TABLE "Venue" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Venue" ADD COLUMN "lng" DOUBLE PRECISION;
ALTER TABLE "Venue" ADD COLUMN "formatted_address" TEXT;

-- CreateIndex
CREATE INDEX "Venue_place_id_idx" ON "Venue"("place_id");
