BEGIN;

UPDATE services
SET active = FALSE
WHERE entrepreneur_id IN (
  SELECT id FROM entrepreneur_profiles WHERE is_demo = TRUE
);

UPDATE products
SET active = FALSE
WHERE entrepreneur_id IN (
  SELECT id FROM entrepreneur_profiles WHERE is_demo = TRUE
);

UPDATE entrepreneur_profiles
SET active = FALSE
WHERE is_demo = TRUE;

COMMIT;
