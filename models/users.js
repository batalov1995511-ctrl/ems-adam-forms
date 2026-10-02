const { query } = require("../database");

async function upsertDiscordUser(user) {
  const result = await query(
    `INSERT INTO users (discord_id,discord_username,discord_global_name,discord_avatar,last_login_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (discord_id) DO UPDATE SET
       discord_username=EXCLUDED.discord_username,
       discord_global_name=EXCLUDED.discord_global_name,
       discord_avatar=EXCLUDED.discord_avatar,
       last_login_at=NOW(),
       updated_at=NOW()
     RETURNING *`,
    [String(user.id),user.username||null,user.global_name||null,user.avatar||null]
  );
  return result.rows[0];
}

async function getPermissions(userId) {
  const result = await query(
    `SELECT DISTINCT p.code
     FROM permissions p
     JOIN role_permissions rp ON rp.permission_id=p.id
     JOIN roles r ON r.id=rp.role_id
     LEFT JOIN user_roles ur ON ur.role_id=r.id AND ur.user_id=$1
     JOIN users u ON u.id=$1
     WHERE ur.user_id IS NOT NULL OR r.code=u.access_level
     ORDER BY p.code`,[userId]);
  return result.rows.map(row=>row.code);
}

async function getUserById(id) {
  const result=await query(
    `SELECT u.*,d.name AS department_name
     FROM users u LEFT JOIN departments d ON d.code=u.department_code
     WHERE u.id=$1`,[id]);
  return result.rows[0]||null;
}

async function listEmployees() {
  const result=await query(
    `SELECT u.id,u.discord_username,u.discord_global_name,u.character_name,u.static_id,
       u.department_code,u.rank,u.profile_status,u.access_level,u.is_active,u.last_login_at,
       u.joined_at,u.last_promotion_at,u.employment_status,d.name AS department_name,
       COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL),'{}') AS roles
     FROM users u
     LEFT JOIN departments d ON d.code=u.department_code
     LEFT JOIN user_roles ur ON ur.user_id=u.id
     LEFT JOIN roles r ON r.id=ur.role_id
     GROUP BY u.id,d.name
     ORDER BY COALESCE(u.character_name,u.discord_global_name,u.discord_username) ASC`);
  return result.rows;
}

async function getEmployeeById(id) {
  const result=await query(
    `SELECT u.*,d.name AS department_name,
       COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL),'{}') AS roles
     FROM users u
     LEFT JOIN departments d ON d.code=u.department_code
     LEFT JOIN user_roles ur ON ur.user_id=u.id
     LEFT JOIN roles r ON r.id=ur.role_id
     WHERE u.id=$1 GROUP BY u.id,d.name`,[id]);
  return result.rows[0]||null;
}

async function getDepartments() {
  return (await query(
    `SELECT code,name FROM departments WHERE is_active=TRUE ORDER BY sort_order,code`
  )).rows;
}

async function completeInitialProfile(userId,data) {
  const characterName=String(data.character_name||"").trim();
  const staticId=String(data.static_id||"").trim();
  const departmentCode=String(data.department_code||"").trim().toUpperCase();
  const rank=Number(data.rank);
  if(!characterName||!staticId||!departmentCode||!Number.isInteger(rank)||rank<1||rank>15){
    const error=new Error("Заполните имя, Static ID, отдел и корректный ранг.");
    error.status=400; throw error;
  }
  const dept=await query(`SELECT code FROM departments WHERE code=$1 AND is_active=TRUE`,[departmentCode]);
  if(!dept.rowCount){const error=new Error("Выбран неизвестный отдел.");error.status=400;throw error;}
  const before=await getUserById(userId);
  if(!before) throw new Error("Пользователь не найден.");
  if(before.onboarding_completed_at){
    const error=new Error("Первичная настройка профиля уже завершена.");error.status=409;throw error;
  }
  const result=await query(
    `UPDATE users SET character_name=$2,static_id=$3,department_code=$4,rank=$5,
       profile_status='pending',onboarding_completed_at=NOW(),joined_at=COALESCE(joined_at,NOW()),
       updated_at=NOW() WHERE id=$1 RETURNING *`,
    [userId,characterName,staticId,departmentCode,rank]);
  await query(
    `INSERT INTO personnel_events(user_id,actor_user_id,event_type,previous_data,new_data,note)
     VALUES($1,$1,'profile_initialized',$2::jsonb,$3::jsonb,$4)`,
    [userId,JSON.stringify({character_name:before.character_name,static_id:before.static_id,department_code:before.department_code,rank:before.rank}),
     JSON.stringify({character_name:characterName,static_id:staticId,department_code:departmentCode,rank}),"Первичное заполнение сотрудником; ожидает подтверждения"]);
  await query(
    `INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,'personnel.profile_initialized','user',$2,$3::jsonb)`,
    [userId,String(userId),JSON.stringify({department_code:departmentCode,rank})]);
  return result.rows[0];
}

async function updateEmployeePersonnel(employeeId,actorUserId,data,ipAddress) {
  const before=await getEmployeeById(employeeId);
  if(!before){const error=new Error("Сотрудник не найден.");error.status=404;throw error;}
  const characterName=String(data.character_name||"").trim();
  const staticId=String(data.static_id||"").trim();
  const departmentCode=String(data.department_code||"").trim().toUpperCase();
  const rank=Number(data.rank);
  const profileStatus=String(data.profile_status||"pending");
  const isActive=data.is_active==="true"||data.is_active==="on";
  if(!characterName||!staticId||!departmentCode||!Number.isInteger(rank)||rank<1||rank>15)
    {const e=new Error("Проверьте имя, Static ID, отдел и ранг.");e.status=400;throw e;}
  if(!["pending","approved","rejected"].includes(profileStatus))
    {const e=new Error("Некорректный статус профиля.");e.status=400;throw e;}
  const dept=await query(`SELECT code FROM departments WHERE code=$1 AND is_active=TRUE`,[departmentCode]);
  if(!dept.rowCount){const e=new Error("Выбран неизвестный отдел.");e.status=400;throw e;}
  const changes={};
  for(const [key,next] of Object.entries({character_name:characterName,static_id:staticId,department_code:departmentCode,rank,profile_status:profileStatus,is_active:isActive})){
    if(String(before[key]??"")!==String(next??"")) changes[key]={from:before[key]??null,to:next};
  }
  if(!Object.keys(changes).length) return before;
  const promoted=Number.isInteger(before.rank)&&rank>before.rank;
  const result=await query(
    `UPDATE users SET character_name=$2,static_id=$3,department_code=$4,rank=$5,profile_status=$6,
       is_active=$7,employment_status=CASE WHEN $7 THEN 'active' ELSE 'inactive' END,
       approved_at=CASE WHEN $6='approved' THEN COALESCE(approved_at,NOW()) ELSE approved_at END,
       approved_by=CASE WHEN $6='approved' THEN $8 ELSE approved_by END,
       last_promotion_at=CASE WHEN $9 THEN NOW() ELSE last_promotion_at END,
       updated_at=NOW() WHERE id=$1 RETURNING *`,
    [employeeId,characterName,staticId,departmentCode,rank,profileStatus,isActive,actorUserId,promoted]);
  await query(
    `INSERT INTO personnel_events(user_id,actor_user_id,event_type,previous_data,new_data,note)
     VALUES($1,$2,'personnel_updated',$3::jsonb,$4::jsonb,$5)`,
    [employeeId,actorUserId,JSON.stringify(Object.fromEntries(Object.entries(changes).map(([k,v])=>[k,v.from]))),
     JSON.stringify(Object.fromEntries(Object.entries(changes).map(([k,v])=>[k,v.to]))),String(data.note||"").trim()||null]);
  await query(
    `INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,details,ip_address)
     VALUES($1,'personnel.updated','user',$2,$3::jsonb,$4)`,
    [actorUserId,String(employeeId),JSON.stringify({changes,note:String(data.note||"").trim()||null}),ipAddress||null]);
  return result.rows[0];
}

async function listPersonnelEvents(userId) {
  return (await query(
    `SELECT pe.*,COALESCE(a.character_name,a.discord_global_name,a.discord_username,'Система') AS actor_name
     FROM personnel_events pe LEFT JOIN users a ON a.id=pe.actor_user_id
     WHERE pe.user_id=$1 ORDER BY pe.created_at DESC LIMIT 100`,[userId])).rows;
}

module.exports={upsertDiscordUser,getPermissions,getUserById,listEmployees,getEmployeeById,getDepartments,completeInitialProfile,updateEmployeePersonnel,listPersonnelEvents};
