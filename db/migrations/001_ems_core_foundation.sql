-- EMS Core Foundation
-- Tested on a temporary Neon branch before production rollout.
-- Safe/idempotent foundation migration.

BEGIN;

CREATE TABLE IF NOT EXISTS departments (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO departments(code,name,sort_order) VALUES
 ('HAD','Hospital Administration Department',10),
 ('PSED','Psychological and Sanitary-Epidemiological Department',20),
 ('PM','Paramedic',30),
 ('DI','Department Internship',40),
 ('SD','Surgeon Department',50),
 ('EMT','Emergency Medical Technician',60)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order;

ALTER TABLE users ADD COLUMN IF NOT EXISTS department_code VARCHAR(10) REFERENCES departments(code);
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by BIGINT;

UPDATE users
SET department_code=department
WHERE department_code IS NULL
  AND department IN ('HAD','PSED','PM','DI','SD','EMT');

CREATE INDEX IF NOT EXISTS idx_users_department_code ON users(department_code);

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id,permission_id)
);

CREATE TABLE IF NOT EXISTS navigation_items (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(80) UNIQUE NOT NULL,
  title VARCHAR(120) NOT NULL,
  href VARCHAR(255) NOT NULL,
  icon VARCHAR(80),
  section VARCHAR(80) NOT NULL DEFAULT 'main',
  sort_order INTEGER NOT NULL DEFAULT 0,
  required_permission VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80),
  entity_id VARCHAR(100),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);

INSERT INTO roles(code,name,is_system) VALUES
 ('employee','Сотрудник',TRUE),
 ('department_lead','Руководство отдела',TRUE),
 ('senior','Старший состав',TRUE),
 ('chief','Руководство EMS',TRUE),
 ('tech_admin','Технический администратор',TRUE)
ON CONFLICT(code) DO NOTHING;

INSERT INTO permissions(code,name) VALUES
 ('dashboard.view','Просмотр панели'),
 ('profile.edit','Редактирование профиля'),
 ('forms.submit','Подача форм'),
 ('employees.view','Просмотр сотрудников'),
 ('employees.manage','Управление сотрудниками'),
 ('departments.manage','Управление отделами'),
 ('decisions.manage','Очередь решений'),
 ('reports.manage','Управление отчётами'),
 ('control.access','Доступ к EMS Core Administration'),
 ('audit.view','Просмотр журнала действий'),
 ('roles.manage','Управление ролями и правами'),
 ('navigation.manage','Управление навигацией')
ON CONFLICT(code) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code IN ('chief','tech_admin')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r
JOIN permissions p ON p.code IN ('dashboard.view','profile.edit','forms.submit')
WHERE r.code='employee'
ON CONFLICT DO NOTHING;

INSERT INTO navigation_items(code,title,href,section,sort_order,required_permission) VALUES
 ('dashboard','Главная','/dashboard','main',10,'dashboard.view'),
 ('profile','Мой профиль','/profile','main',20,'dashboard.view'),
 ('forms','Формы','/forms','services',10,'forms.submit'),
 ('control','Администрирование','/control','admin',10,'control.access')
ON CONFLICT(code) DO NOTHING;

COMMIT;
