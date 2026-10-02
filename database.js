const { Pool } = require("pg");
let pool;
function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
    pool.on("error", (error) => console.error("PostgreSQL pool error:", error.message));
  }
  return pool;
}
async function query(text, params) { return getPool().query(text, params); }
async function healthcheck() { return (await query("SELECT NOW() AS now")).rows[0]; }
module.exports = { getPool, query, healthcheck };
