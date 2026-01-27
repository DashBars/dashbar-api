-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('pending', 'approved', 'completed', 'rejected', 'cancelled');

-- CreateTable: ReturnPolicy
CREATE TABLE "return_policy" (
  "id" SERIAL PRIMARY KEY,
  "event_id" INTEGER NOT NULL UNIQUE,
  "owner_id" INTEGER NOT NULL,
  "auto_return_to_global" BOOLEAN NOT NULL DEFAULT true,
  "require_approval" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("event_id") REFERENCES "Event"("id"),
  FOREIGN KEY ("owner_id") REFERENCES "User"("id")
);

-- CreateTable: StockReturn
CREATE TABLE "stock_return" (
  "id" SERIAL PRIMARY KEY,
  "policy_id" INTEGER NOT NULL,
  "bar_id" INTEGER NOT NULL,
  "drink_id" INTEGER NOT NULL,
  "supplier_id" INTEGER,
  "quantity" INTEGER NOT NULL,
  "unit_cost" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "ownership_mode" "OwnershipMode" NOT NULL,
  "status" "ReturnStatus" NOT NULL DEFAULT 'pending',
  "reason" TEXT,
  "notes" TEXT,
  "requested_at" TIMESTAMP,
  "approved_at" TIMESTAMP,
  "completed_at" TIMESTAMP,
  "requested_by_id" INTEGER,
  "approved_by_id" INTEGER,
  "completed_by_id" INTEGER,
  FOREIGN KEY ("policy_id") REFERENCES "return_policy"("id"),
  FOREIGN KEY ("bar_id") REFERENCES "Bar"("id"),
  FOREIGN KEY ("drink_id") REFERENCES "Drink"("id"),
  FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id"),
  FOREIGN KEY ("requested_by_id") REFERENCES "User"("id"),
  FOREIGN KEY ("approved_by_id") REFERENCES "User"("id"),
  FOREIGN KEY ("completed_by_id") REFERENCES "User"("id")
);

-- CreateIndex
CREATE INDEX "return_policy_event_id_idx" ON "return_policy"("event_id");
CREATE INDEX "stock_return_policy_id_idx" ON "stock_return"("policy_id");
CREATE INDEX "stock_return_status_idx" ON "stock_return"("status");
