-- CreateEnums
CREATE TYPE "StockLocationType" AS ENUM ('GLOBAL', 'BAR', 'PROVIDER');
CREATE TYPE "StockMovementReason" AS ENUM (
  'ASSIGN_TO_BAR',
  'MOVE_BETWEEN_BARS',
  'RETURN_TO_GLOBAL',
  'SALE_DECREMENT',
  'ADJUSTMENT',
  'RETURN_TO_PROVIDER',
  'INITIAL_LOAD'
);

-- CreateTable: GlobalInventory
CREATE TABLE "global_inventory" (
  "id" SERIAL PRIMARY KEY,
  "owner_id" INTEGER NOT NULL,
  "drink_id" INTEGER NOT NULL,
  "supplier_id" INTEGER,
  "ownership_mode" "OwnershipMode" NOT NULL DEFAULT 'purchased',
  "total_quantity" INTEGER NOT NULL,
  "allocated_quantity" INTEGER NOT NULL DEFAULT 0,
  "unit_cost" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "sku" TEXT,
  "received_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "last_updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("owner_id") REFERENCES "User"("id"),
  FOREIGN KEY ("drink_id") REFERENCES "Drink"("id"),
  FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id"),
  UNIQUE ("owner_id", "drink_id", "supplier_id")
);

-- Migrate data from ManagerInventory to GlobalInventory
INSERT INTO "global_inventory" (
  "owner_id", "drink_id", "supplier_id", "total_quantity", 
  "allocated_quantity", "unit_cost", "currency", "sku", "received_at"
)
SELECT 
  "owner_id", "drink_id", "supplier_id", "total_quantity",
  "allocated_quantity", "unit_cost", "currency", "sku", "received_at"
FROM "manager_inventory";

-- AlterTable: Extend InventoryMovement
ALTER TABLE "inventory_movement" ADD COLUMN "from_location_type" "StockLocationType";
ALTER TABLE "inventory_movement" ADD COLUMN "from_location_id" INTEGER;
ALTER TABLE "inventory_movement" ADD COLUMN "to_location_type" "StockLocationType";
ALTER TABLE "inventory_movement" ADD COLUMN "to_location_id" INTEGER;
ALTER TABLE "inventory_movement" ADD COLUMN "reason" "StockMovementReason";
ALTER TABLE "inventory_movement" ADD COLUMN "performed_by_id" INTEGER;
ALTER TABLE "inventory_movement" ADD COLUMN "global_inventory_id" INTEGER;

-- Add foreign keys
ALTER TABLE "inventory_movement" 
  ADD CONSTRAINT "inventory_movement_performed_by_id_fkey" 
  FOREIGN KEY ("performed_by_id") REFERENCES "User"("id");
  
ALTER TABLE "inventory_movement"
  ADD CONSTRAINT "inventory_movement_global_inventory_id_fkey"
  FOREIGN KEY ("global_inventory_id") REFERENCES "global_inventory"("id");

-- Migrate existing data: infer from/to from barId
UPDATE "inventory_movement"
SET 
  "from_location_type" = CASE WHEN "quantity" < 0 THEN 'BAR'::"StockLocationType" ELSE NULL END,
  "from_location_id" = CASE WHEN "quantity" < 0 THEN "bar_id" ELSE NULL END,
  "to_location_type" = CASE WHEN "quantity" > 0 THEN 'BAR'::"StockLocationType" ELSE NULL END,
  "to_location_id" = CASE WHEN "quantity" > 0 THEN "bar_id" ELSE NULL END;

-- CreateIndex
CREATE INDEX "global_inventory_owner_id_idx" ON "global_inventory"("owner_id");
CREATE INDEX "inventory_movement_from_location_type_idx" ON "inventory_movement"("from_location_type");
CREATE INDEX "inventory_movement_to_location_type_idx" ON "inventory_movement"("to_location_type");
