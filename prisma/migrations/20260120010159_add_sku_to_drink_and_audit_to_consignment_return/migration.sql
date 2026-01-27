-- Step 1: Add sku column to Drink as nullable first
ALTER TABLE "Drink" ADD COLUMN IF NOT EXISTS "sku" TEXT;

-- Step 2: Generate SKUs for existing drinks based on name and id
UPDATE "Drink" 
SET "sku" = 'DRINK-' || UPPER(REPLACE(REPLACE(name, ' ', '-'), '''', '')) || '-' || LPAD(id::TEXT, 3, '0')
WHERE "sku" IS NULL;

-- Step 3: Make sku NOT NULL and add unique constraint
ALTER TABLE "Drink" ALTER COLUMN "sku" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Drink_sku_key" ON "Drink"("sku");

-- Step 4: Add performed_by_id column to ConsignmentReturn (nullable for existing records)
ALTER TABLE "consignment_return" ADD COLUMN IF NOT EXISTS "performed_by_id" INTEGER;

-- Step 5: For existing consignment returns without performed_by_id, set to a default user (if exists)
-- Try admin first, then any user, otherwise leave NULL (will be handled in application layer)
DO $$
DECLARE
  default_user_id INTEGER;
BEGIN
  -- Try to get an admin user
  SELECT id INTO default_user_id FROM "User" WHERE role = 'admin' LIMIT 1;
  
  -- If no admin, get any user
  IF default_user_id IS NULL THEN
    SELECT id INTO default_user_id FROM "User" LIMIT 1;
  END IF;
  
  -- Update existing records if we found a user
  IF default_user_id IS NOT NULL THEN
    UPDATE "consignment_return" 
    SET "performed_by_id" = default_user_id
    WHERE "performed_by_id" IS NULL;
    
    -- Only make NOT NULL if we successfully updated all records
    ALTER TABLE "consignment_return" ALTER COLUMN "performed_by_id" SET NOT NULL;
  END IF;
END $$;

-- Step 7: Add foreign key constraint (only if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'consignment_return_performed_by_id_fkey'
  ) THEN
    ALTER TABLE "consignment_return" 
    ADD CONSTRAINT "consignment_return_performed_by_id_fkey" 
    FOREIGN KEY ("performed_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
