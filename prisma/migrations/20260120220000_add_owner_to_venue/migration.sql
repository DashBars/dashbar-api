-- Step 1: Add owner_id column as nullable first
ALTER TABLE "Venue" ADD COLUMN "owner_id" INTEGER;

-- Step 2: Assign default owner to existing venues (use first manager/admin user)
-- If no manager exists, this will need to be handled manually
UPDATE "Venue" 
SET "owner_id" = (
  SELECT id FROM "User" 
  WHERE role IN ('manager', 'admin') 
  ORDER BY id 
  LIMIT 1
)
WHERE "owner_id" IS NULL;

-- Step 3: If no manager/admin exists, assign to first user (fallback)
UPDATE "Venue" 
SET "owner_id" = (SELECT id FROM "User" ORDER BY id LIMIT 1)
WHERE "owner_id" IS NULL;

-- Step 4: Add foreign key constraint
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: Make owner_id NOT NULL (only if all venues have owner_id)
-- If there are still NULL values, this will fail - handle manually
ALTER TABLE "Venue" ALTER COLUMN "owner_id" SET NOT NULL;
