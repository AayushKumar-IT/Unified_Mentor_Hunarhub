INSERT INTO categories (name, slug, sort_order) VALUES
  ('Cobbler', 'cobbler', 1),
  ('Potter (Kumhar)', 'potter', 2),
  ('Tailor', 'tailor', 3),
  ('Artisan', 'artisan', 4),
  ('Small vendor', 'small-vendor', 5)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

INSERT INTO skills (category_id, name, slug)
SELECT c.id, skill.name, skill.slug
FROM (VALUES
  ('cobbler', 'Shoe repair', 'shoe-repair'),
  ('cobbler', 'Shoe polishing', 'shoe-polishing'),
  ('cobbler', 'Leather repair', 'leather-repair'),
  ('potter', 'Wheel throwing', 'wheel-throwing'),
  ('potter', 'Hand building', 'hand-building'),
  ('potter', 'Glazing', 'glazing'),
  ('tailor', 'Alterations', 'alterations'),
  ('tailor', 'Custom stitching', 'custom-stitching'),
  ('tailor', 'Embroidery', 'embroidery'),
  ('artisan', 'Hand embroidery', 'hand-embroidery'),
  ('artisan', 'Textile craft', 'textile-craft'),
  ('artisan', 'Handmade gifts', 'handmade-gifts'),
  ('small-vendor', 'Local produce', 'local-produce'),
  ('small-vendor', 'Packaged foods', 'packaged-foods'),
  ('small-vendor', 'Handmade goods', 'handmade-goods')
) AS skill(category_slug, name, slug)
JOIN categories c ON c.slug = skill.category_slug
ON CONFLICT (category_id, slug) DO UPDATE SET name = EXCLUDED.name, active = TRUE;
