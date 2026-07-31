-- Andeco Horizon — Railway Postgres (clean empty workspace)
-- One JSON document for the whole CRM. No Supabase Auth tables.

CREATE TABLE IF NOT EXISTS app_data (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_data (id, payload)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
