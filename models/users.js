const { query } = require("../database");
async function upsertDiscordUser(user) {
 const result=await query(
  `INSERT INTO users(discord_id,discord_username,discord_global_name,discord_avatar,last_login_at)
   VALUES($1,$2,$3,$4,NOW())
   ON CONFLICT(discord_id) DO UPDATE SET discord_username=EXCLUDED.discord_username,
   discord_global_name=EXCLUDED.discord_global_name,discord_avatar=EXCLUDED.discord_avatar,
   last_login_at=NOW(),updated_at=NOW() RETURNING *`,
  [String(user.id),user.username||null,user.global_name||null,user.avatar||null]);
 return result.rows[0];
}
module.exports={upsertDiscordUser};
