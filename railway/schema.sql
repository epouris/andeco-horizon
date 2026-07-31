-- Andeco Horizon Suite — Railway Postgres
-- Workspace JSON + CRM users (login).

CREATE TABLE IF NOT EXISTS app_data (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_data (id, payload)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  allowed_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_username_idx ON users (username);
