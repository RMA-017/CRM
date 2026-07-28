DO $$
DECLARE
  target_column TEXT;
  constraint_record RECORD;
BEGIN
  FOREACH target_column IN ARRAY ARRAY['closing_balance_uzs', 'expected_balance_uzs'] LOOP
    FOR constraint_record IN
      SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = ANY(c.conkey)
       WHERE c.conrelid = 'finance_cash_sessions'::regclass
         AND c.contype = 'c'
         AND a.attname = target_column
         AND pg_get_constraintdef(c.oid) LIKE '%>= 0%'
    LOOP
      EXECUTE format(
        'ALTER TABLE finance_cash_sessions DROP CONSTRAINT %I',
        constraint_record.conname
      );
    END LOOP;
  END LOOP;
END $$;
