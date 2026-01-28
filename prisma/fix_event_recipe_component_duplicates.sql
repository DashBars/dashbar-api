-- Deduplicate components created by the failed migration
-- Keep the lowest id per (event_recipe_id, drink_id)
WITH ranked AS (
  SELECT
    id,
    event_recipe_id,
    drink_id,
    ROW_NUMBER() OVER (PARTITION BY event_recipe_id, drink_id ORDER BY id) AS rn
  FROM event_recipe_component
)
DELETE FROM event_recipe_component
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Create the missing unique index (safe if it already exists)
CREATE UNIQUE INDEX IF NOT EXISTS "event_recipe_component_event_recipe_id_drink_id_key"
  ON "event_recipe_component"("event_recipe_id", "drink_id");

