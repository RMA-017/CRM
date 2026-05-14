WITH preferred_code_org AS (
  SELECT id
    FROM organizations
   WHERE is_active = TRUE
     AND LOWER(code) = ANY(ARRAY[
       'aaron',
       'aaron-academy-kids',
       'aaron_academy_kids',
       'aaron-academy',
       'aaronacademy'
     ]::text[])
   ORDER BY array_position(ARRAY[
       'aaron',
       'aaron-academy-kids',
       'aaron_academy_kids',
       'aaron-academy',
       'aaronacademy'
     ]::text[], LOWER(code)), id ASC
   LIMIT 1
),
site_content_org AS (
  SELECT o.id
    FROM organizations o
    JOIN site_content_items sci
      ON sci.organization_id = o.id
     AND sci.is_active = TRUE
   WHERE o.is_active = TRUE
   GROUP BY o.id
   ORDER BY COUNT(*) DESC, o.id ASC
   LIMIT 1
),
target_org AS (
  SELECT id FROM preferred_code_org
  UNION ALL
  SELECT id FROM site_content_org
   WHERE NOT EXISTS (SELECT 1 FROM preferred_code_org)
  LIMIT 1
)
UPDATE crm_leads lead
   SET organization_id = target_org.id,
       updated_at = CURRENT_TIMESTAMP
  FROM target_org
 WHERE lead.source = 'website'
   AND lead.organization_id <> target_org.id
   AND NOT EXISTS (
     SELECT 1
       FROM crm_leads existing
      WHERE existing.organization_id = target_org.id
        AND existing.phone_digits = lead.phone_digits
   );
