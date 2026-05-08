ALTER TABLE site_content_items
  ALTER COLUMN description TYPE TEXT,
  ALTER COLUMN description_uz TYPE TEXT,
  ALTER COLUMN description_ru TYPE TEXT;

ALTER TABLE site_content_items
  DROP CONSTRAINT IF EXISTS site_content_items_section_key_check,
  DROP CONSTRAINT IF EXISTS site_content_items_check;

ALTER TABLE site_content_items
  ADD CONSTRAINT site_content_items_section_key_check
    CHECK (section_key IN ('kids', 'blog', 'team', 'partners')),
  ADD CONSTRAINT site_content_items_content_check
    CHECK (
      (section_key = 'kids' AND author IS NOT NULL AND name IS NULL)
      OR
      (section_key IN ('blog', 'team', 'partners') AND name IS NOT NULL)
    );
