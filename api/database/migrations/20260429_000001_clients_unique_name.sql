DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM clients c
     GROUP BY
       c.organization_id,
       LOWER(TRIM(c.first_name)),
       LOWER(TRIM(c.last_name)),
       LOWER(TRIM(COALESCE(c.middle_name, '')))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot apply uq_clients_org_person_name_ci while duplicate client names already exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_org_person_name_ci
  ON clients (
    organization_id,
    LOWER(TRIM(first_name)),
    LOWER(TRIM(last_name)),
    LOWER(TRIM(COALESCE(middle_name, '')))
  );
