require("dotenv").config();
const { getPool } = require("../database");
const sql = `
CREATE TABLE IF NOT EXISTS departments (
 id BIGSERIAL PRIMARY KEY, code VARCHAR(10) UNIQUE NOT NULL, name VARCHAR(120) NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS users (
 id BIGSERIAL PRIMARY KEY, discord_id VARCHAR(32) UNIQUE NOT NULL, discord_username VARCHAR(100),
 discord_global_name VARCHAR(100), discord_avatar VARCHAR(255), character_name VARCHAR(150), static_id VARCHAR(50),
 department_code VARCHAR(10) REFERENCES departments(code), rank INTEGER CHECK(rank IS NULL OR rank BETWEEN 1 AND 15),
 profile_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(profile_status IN ('pending','approved','rejected')),
 access_level VARCHAR(30) NOT NULL DEFAULT 'employee' CHECK(access_level IN ('employee','department_lead','senior','chief','tech_admin')),
 is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_log (
 id BIGSERIAL PRIMARY KEY, actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
 action VARCHAR(120) NOT NULL, entity_type VARCHAR(80), entity_id VARCHAR(100),
 details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_code);
CREATE INDEX IF NOT EXISTS idx_users_profile_status ON users(profile_status);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);
INSERT INTO departments(code,name,sort_order) VALUES
 ('HAD','Hospital Administration Department',10),('PSED','Psychological and Sanitary-Epidemiological Department',20),
 ('PM','Paramedic',30),('DI','Department Internship',40),('SD','Surgeon Department',50),('EMT','Emergency Medical Technician',60)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order;
`;
(async()=>{const pool=getPool();try{await pool.query("BEGIN");await pool.query(sql);await pool.query("COMMIT");console.log("EMS Core migration completed.");}catch(e){await pool.query("ROLLBACK");console.error("Migration failed:",e.message);process.exitCode=1;}finally{await pool.end();}})();
