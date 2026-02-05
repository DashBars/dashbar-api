-- Step 1: Create new tables
CREATE TABLE IF NOT EXISTS "event_recipe_bar_type" (
    "event_recipe_id" INTEGER NOT NULL,
    "bar_type" "BarType" NOT NULL,
    CONSTRAINT "event_recipe_bar_type_pkey" PRIMARY KEY ("event_recipe_id", "bar_type")
);

CREATE TABLE IF NOT EXISTS "event_recipe_component" (
    "id" SERIAL NOT NULL,
    "event_recipe_id" INTEGER NOT NULL,
    "drink_id" INTEGER NOT NULL,
    "percentage" INTEGER NOT NULL,
    CONSTRAINT "event_recipe_component_pkey" PRIMARY KEY ("id")
);

-- Step 2: Create temporary table with new structure
CREATE TABLE IF NOT EXISTS "event_recipe_new" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "cocktail_name" TEXT NOT NULL,
    "glass_volume" INTEGER NOT NULL,
    "has_ice" BOOLEAN NOT NULL DEFAULT false,
    "sale_price" INTEGER NOT NULL,
    CONSTRAINT "event_recipe_new_pkey" PRIMARY KEY ("id")
);

-- Step 3: Migrate data from old structure to new structure
-- Create one recipe per (eventId, cocktail) and attach all barTypes
INSERT INTO "event_recipe_new" ("event_id", "cocktail_name", "glass_volume", "has_ice", "sale_price")
SELECT DISTINCT
    er."event_id",
    COALESCE(c.name, 'Cocktail ' || er."cocktail_id"::text) as "cocktail_name",
    COALESCE(c.volume, 200) as "glass_volume",
    false as "has_ice",
    COALESCE(ep.price, c.price, 0) as "sale_price"
FROM "event_recipe" er
LEFT JOIN "Cocktail" c ON c.id = er."cocktail_id"
LEFT JOIN "event_price" ep ON ep."event_id" = er."event_id" AND ep."cocktail_id" = er."cocktail_id"
GROUP BY er."event_id", er."cocktail_id", c.name, c.volume, c.price, ep.price;

-- Step 4: Migrate bar types to EventRecipeBarType
INSERT INTO "event_recipe_bar_type" ("event_recipe_id", "bar_type")
SELECT 
    ern.id as "event_recipe_id",
    er."bar_type"
FROM "event_recipe_new" ern
INNER JOIN "event_recipe" er ON 
    er."event_id" = ern."event_id" AND
    COALESCE((SELECT name FROM "Cocktail" WHERE id = er."cocktail_id"), 'Cocktail ' || er."cocktail_id"::text) = ern."cocktail_name"
GROUP BY ern.id, er."bar_type";

-- Step 5: Migrate components to EventRecipeComponent
INSERT INTO "event_recipe_component" ("event_recipe_id", "drink_id", "percentage")
SELECT 
    ern.id as "event_recipe_id",
    er."drink_id",
    MAX(er."cocktail_percentage") as "percentage"
FROM "event_recipe_new" ern
INNER JOIN "event_recipe" er ON 
    er."event_id" = ern."event_id" AND
    COALESCE((SELECT name FROM "Cocktail" WHERE id = er."cocktail_id"), 'Cocktail ' || er."cocktail_id"::text) = ern."cocktail_name"
GROUP BY ern.id, er."drink_id";

-- Step 6: Drop old table and rename new table
DROP TABLE IF EXISTS "event_recipe" CASCADE;
ALTER TABLE "event_recipe_new" RENAME TO "event_recipe";

-- Step 7: Add foreign key constraints
ALTER TABLE "event_recipe_bar_type" ADD CONSTRAINT "event_recipe_bar_type_event_recipe_id_fkey" FOREIGN KEY ("event_recipe_id") REFERENCES "event_recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_recipe_component" ADD CONSTRAINT "event_recipe_component_event_recipe_id_fkey" FOREIGN KEY ("event_recipe_id") REFERENCES "event_recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_recipe_component" ADD CONSTRAINT "event_recipe_component_drink_id_fkey" FOREIGN KEY ("drink_id") REFERENCES "Drink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_recipe" ADD CONSTRAINT "event_recipe_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 8: Add unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "event_recipe_event_id_cocktail_name_key" ON "event_recipe"("event_id", "cocktail_name");
CREATE UNIQUE INDEX IF NOT EXISTS "event_recipe_component_event_recipe_id_drink_id_key" ON "event_recipe_component"("event_recipe_id", "drink_id");
