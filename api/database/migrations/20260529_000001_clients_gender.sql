ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS gender VARCHAR(16);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_clients_gender'
       AND conrelid = 'clients'::regclass
  ) THEN
    ALTER TABLE clients
      ADD CONSTRAINT chk_clients_gender
      CHECK (gender IS NULL OR gender IN ('male', 'female'));
  END IF;
END $$;

