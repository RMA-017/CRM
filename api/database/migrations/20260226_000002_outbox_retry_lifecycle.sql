ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS retry_count INTEGER,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP;

UPDATE outbox_events
   SET retry_count = 0
 WHERE retry_count IS NULL;

UPDATE outbox_events
   SET max_retries = 5
 WHERE max_retries IS NULL;

ALTER TABLE outbox_events
  ALTER COLUMN retry_count SET DEFAULT 0,
  ALTER COLUMN retry_count SET NOT NULL,
  ALTER COLUMN max_retries SET DEFAULT 5,
  ALTER COLUMN max_retries SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'ck_outbox_events_retry_count'
       AND conrelid = 'outbox_events'::regclass
  ) THEN
    ALTER TABLE outbox_events
      ADD CONSTRAINT ck_outbox_events_retry_count
      CHECK (retry_count >= 0 AND retry_count <= 1000);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'ck_outbox_events_max_retries'
       AND conrelid = 'outbox_events'::regclass
  ) THEN
    ALTER TABLE outbox_events
      ADD CONSTRAINT ck_outbox_events_max_retries
      CHECK (max_retries >= 0 AND max_retries <= 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_outbox_events_pending_retry
  ON outbox_events (status, next_retry_at ASC, created_at ASC)
  WHERE status = 'pending';

