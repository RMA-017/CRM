ALTER TABLE site_content_items
  ADD COLUMN IF NOT EXISTS author_uz VARCHAR(128),
  ADD COLUMN IF NOT EXISTS author_ru VARCHAR(128),
  ADD COLUMN IF NOT EXISTS name_uz VARCHAR(128),
  ADD COLUMN IF NOT EXISTS name_ru VARCHAR(128),
  ADD COLUMN IF NOT EXISTS role_uz VARCHAR(128),
  ADD COLUMN IF NOT EXISTS role_ru VARCHAR(128),
  ADD COLUMN IF NOT EXISTS description_uz VARCHAR(512),
  ADD COLUMN IF NOT EXISTS description_ru VARCHAR(512);

UPDATE site_content_items
   SET author_uz = COALESCE(author_uz, author),
       author_ru = COALESCE(author_ru, author),
       name_uz = COALESCE(name_uz, name),
       name_ru = COALESCE(name_ru, name),
       role_uz = COALESCE(role_uz, role),
       role_ru = COALESCE(role_ru, role),
       description_uz = COALESCE(description_uz, description),
       description_ru = COALESCE(description_ru, description)
 WHERE author_uz IS NULL
    OR author_ru IS NULL
    OR name_uz IS NULL
    OR name_ru IS NULL
    OR role_uz IS NULL
    OR role_ru IS NULL
    OR description_uz IS NULL
    OR description_ru IS NULL;
