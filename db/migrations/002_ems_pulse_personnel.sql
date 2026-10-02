-- EMS Pulse Personnel v1
-- Adds the service profile lifecycle and immutable personnel history.
-- Safe/idempotent migration.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_promotion_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_status VARCHAR(30) NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_employment_status_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_employment_status_check
      CHECK (employment_status IN ('active','inactive','dismissed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS personnel_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  source_type VARCHAR(50),
  source_id VARCHAR(100),
  previous_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personnel_events_user_created
  ON personnel_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_personnel_events_type
  ON personnel_events(event_type);

INSERT INTO permissions(code,name) VALUES
 ('personnel.history.view','Просмотр истории службы')
ON CONFLICT(code) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('chief','tech_admin')
  AND p.code='personnel.history.view'
ON CONFLICT DO NOTHING;

UPDATE permissions
SET name='Доступ к EMS Pulse Administration'
WHERE code='control.access';

COMMIT;
