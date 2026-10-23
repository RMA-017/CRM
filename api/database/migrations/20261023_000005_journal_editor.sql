-- Journal corrections do not change the immutable lesson occurrence used by the bot.
ALTER TABLE internal_lesson_completions
  ADD COLUMN journal_date DATE,
  ADD COLUMN journal_client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN journal_specialist_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN journal_client_name VARCHAR(255),
  ADD COLUMN journal_specialist_name VARCHAR(255),
  ADD COLUMN journal_position_name VARCHAR(255);
