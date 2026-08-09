const express = require("express");
const axios = require("axios");
const router = express.Router();

const DEPARTMENTS = ["HAD","DI","PM","EMT","SD","PSED"];
const SENIOR_RANKS = [11,12,13];

const rankNames = {
  3:"Фельдшер",4:"Старший фельдшер",5:"Реаниматолог",6:"Терапевт",
  7:"Психиатр",8:"Анестезиолог",9:"Невролог",10:"Врач высшей категории",
  11:"Инструктор",12:"Заместитель заведующего отделением",13:"Заведующий отделением"
};

const schema = {
  HAD:[
    ["fullNameStatic","Фамилия Имя | Статик",1],
    ["reprimandsIssued","Выданные выговоры",1],
    ["reprimandsWorked","Проверенные отработки выговоров",1],
    ["chartersAccepted","Принятые уставы",1],
    ["reattestationsAccepted","Принятые переаттестации сотрудников",1],
    ["supervision","Надзорная деятельность",1],
    ["briefings","Проведённые брифинги",1],
    ["firstAid","Оказание ПМП",1],
    ["tabletsIssued","Выданные таблетки",1],
    ["vaccinesIssued","Выданные вакцины",1]
  ],
  DI:[
    ["fullNameStatic","Имя Фамилия | Статик",1],
    ["joinDate","Дата вступления в EMS",1,"date"],
    ["interviews","Собеседования (ссылка | количество)",1],
    ["reportsChecked","Проверенные отчеты (ссылка | количество)",1],
    ["lecturesChecked","Проверенный лекции (ссылка | количество)",1],
    ["govWaves","Гос. волны (ссылка | количество)",1],
    ["vaccines","Вакцины (ссылка | количество)",0],
    ["firstAid","ПМП (ссылка | количество)",0],
    ["tablets","Таблетки (ссылка | количество)",0],
    ["medCards","Мед. карты (ссылка | количество)",0]
  ],
  PM:[
    ["fullName","Имя Фамилия",1],
    ["staticId","Статик",1],
    ["joinDate","Дата вступления в EMS",1,"date"],
    ["firstAid","ПМП (ссылка | количество)",1],
    ["vaccines","Вакцины (ссылка | количество)",1],
    ["tablets","Таблетки (ссылка | количество)",1]
  ],
  EMT:[
    ["fullNameStatic","Имя Фамилия | Статик",1],
    ["joinDate","Дата вступления в EMS",1,"date"],
    ["firstAid","ПМП (ссылка | количество)",1],
    ["vaccines","Вакцины (ссылка | количество)",1],
    ["tablets","Таблетки (ссылка | количество)",1],
    ["medCards","Выдача мед. карт. (ссылка | количество)",0],
    ["supply","МП | ГМП | Поставки (ссылка | количество)",0]
  ],
  SD:[
    ["fullNameStatic","Имя Фамилия | Статик",1],
    ["joinDate","Дата вступления в EMS",1,"date"],
    ["firstAid","ПМП (ссылка | количество)",0],
    ["vaccines","Вакцины (ссылка | количество)",0],
    ["tablets","Таблетки (ссылка | количество)",1],
    ["medCards","Мед. карты (ссылка | количество)",1],
    ["operations","Операции (ссылка из канала ds)",1],
    ["rpTests","RP-тесты (ссылка из канала ds)",1]
  ],
  PSED:[
    ["fullNameStatic","Имя Фамилия | Статик",1],
    ["joinDate","Дата вступления в EMS",1,"date"],
    ["medCards","Мед. карты (ссылка | количество)",1],
    ["checks","Проверки (ссылка | количество)",1],
    ["tablets","Таблетки (ссылка | количество)",0],
    ["vaccines","Вакцины (ссылка | количество)",0],
    ["firstAid","ПМП (ссылка | количество)",0]
  ],
  SENIOR:[
    ["sender","Отправитель (Имя Фамилия | Статик)",1],
    ["firstAid","ПМП (ссылка | количество)",0],
    ["vaccines","Вакцина (ссылка | количество)",0],
    ["tablets","Таблетки (ссылка | количество)",0],
    ["medCards","Выдача мед. карт (ссылка | количество)",0],
    ["promotions","Повышение сотрудников (ссылка | количество)",0],
    ["resignations","Увольнение сотрудников (ссылка | количество)",0],
    ["promotionChecks","Проверка отчетов на повышение (ссылка | количество)",0],
    ["promotionInChecks","Проверка отчетов на повышение IN (ссылка | количество)",0],
    ["stateChecks","Проверка гос.структур (PSED) (ссылка | количество)",0],
    ["interviews","Собеседования (ссылка | количество)",0],
    ["govWaves","Гос. Волны (ссылка | количество)",0],
    ["lectures","Лекции (ссылка | количество)",0],
    ["reattestations","Переаттестации (ссылка | количество)",0],
    ["supply","МП / ГМП / Поставка (ссылка | количество)",0],
    ["briefings","Брифинги (ссылка | количество)",0]
  ]
};

const config = {
  HAD:["WEEKLY_HAD_WEBHOOK_URL","HAD_HEAD_ROLE_ID","HAD_DEPUTY_ROLE_ID"],
  DI:["WEEKLY_DI_WEBHOOK_URL","DI_HEAD_ROLE_ID","DI_DEPUTY_ROLE_ID"],
  PM:["WEEKLY_PM_WEBHOOK_URL","PM_HEAD_ROLE_ID","PM_DEPUTY_ROLE_ID"],
  EMT:["WEEKLY_EMT_WEBHOOK_URL","EMT_HEAD_ROLE_ID","EMT_DEPUTY_ROLE_ID"],
  SD:["WEEKLY_SD_WEBHOOK_URL","SD_HEAD_ROLE_ID","SD_DEPUTY_ROLE_ID"],
  PSED:["WEEKLY_PSED_WEBHOOK_URL","PSED_HEAD_ROLE_ID","PSED_DEPUTY_ROLE_ID"],
  SENIOR:["WEEKLY_SENIOR_WEBHOOK_URL","CHIEF_DOCTOR_ROLE_ID","DEPUTY_CHIEF_DOCTOR_ROLE_ID"]
};

const FIELD_VALUE_LIMIT = 1000;
const FIELDS_PER_EMBED = 24;
const EMBED_TEXT_LIMIT = 5200;

function auth(req,res,next){
  if(!req.session?.user) return res.redirect("/");
  next();
}

function splitLongLine(line, maxLength = FIELD_VALUE_LIMIT) {
  if (line.length <= maxLength) return [line];

  const words = line.split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxLength) {
        chunks.push(word.slice(i, i + maxLength));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLength) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = word;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitFieldValue(value, maxLength = FIELD_VALUE_LIMIT) {
  const text = String(value ?? "—").trim() || "—";
  if (text.length <= maxLength) return [text];

  const lines = text.split(/\r?\n/);
  const chunks = [];
  let current = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    for (const part of splitLongLine(line, maxLength)) {
      const candidate = current ? `${current}\n${part}` : part;
      if (candidate.length <= maxLength) {
        current = candidate;
      } else {
        if (current) chunks.push(current);
        current = part;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : ["—"];
}

function safeFieldName(label, index, total) {
  const suffix = total > 1 ? ` — часть ${index + 1}/${total}` : "";
  return `${String(label).slice(0, 256 - suffix.length)}${suffix}`;
}

function buildFields(current, body, senderField) {
  const fields = [senderField];

  for (const [name, label] of current) {
    const parts = splitFieldValue(body[name]);
    parts.forEach((part, index) => {
      fields.push({
        name: safeFieldName(label, index, parts.length),
        value: part,
        inline: false
      });
    });
  }

  return fields;
}

function splitIntoEmbeds(fields) {
  const groups = [];
  let current = [];
  let currentSize = 0;

  for (const field of fields) {
    const fieldSize =
      String(field.name || "").length +
      String(field.value || "").length;

    if (
      current.length >= FIELDS_PER_EMBED ||
      (current.length > 0 && currentSize + fieldSize > EMBED_TEXT_LIMIT)
    ) {
      groups.push(current);
      current = [];
      currentSize = 0;
    }

    current.push(field);
    currentSize += fieldSize;
  }

  if (current.length) groups.push(current);
  return groups;
}

router.get("/forms/weekly-report", auth, (req,res)=>{
  res.render("weekly-report",{user:req.session.user, departments:DEPARTMENTS, ranks:rankNames});
});

router.post("/forms/weekly-report", auth, express.urlencoded({extended:true}), async (req,res)=>{
  try{
    const department = String(req.body.department||"").toUpperCase();
    const rank = Number(req.body.rank);

    if(!DEPARTMENTS.includes(department)) return res.status(400).send("Некорректный отдел");
    if(!rankNames[rank]) return res.status(400).send("Некорректный ранг");

    const isSenior = SENIOR_RANKS.includes(rank);
    const key = isSenior ? "SENIOR" : department;
    const current = schema[key];

    const missing = current.filter(x => x[2] && !String(req.body[x[0]] || "").trim());
    if (missing.length) {
      return res.status(400).send(
        "Не заполнены обязательные поля: " + missing.map(x => x[1]).join(", ")
      );
    }

    let webhookKey;
    let roles = [];

    if (rank <= 10) {
      webhookKey = config[department][0];
      roles = [
        process.env[config[department][1]],
        process.env[config[department][2]]
      ].filter(Boolean);
    } else if (rank === 11) {
      webhookKey = "WEEKLY_SENIOR_WEBHOOK_URL";
      roles = [
        process.env[config[department][1]],
        process.env[config[department][2]]
      ].filter(Boolean);
    } else {
      webhookKey = "WEEKLY_SENIOR_WEBHOOK_URL";
      roles = [
        process.env.CHIEF_DOCTOR_ROLE_ID,
        process.env.DEPUTY_CHIEF_DOCTOR_ROLE_ID
      ].filter(Boolean);
    }

    const webhook = process.env[webhookKey];
    if (!webhook) throw new Error("Webhook не настроен: " + webhookKey);

    const user = req.session.user;
    const displayName = user.global_name || user.username || "Неизвестно";
    const senderId = String(user.id);
    const senderMention = `<@${senderId}>`;
    const roleMentions = roles.map(id => `<@&${id}>`).join(" ");

    const senderField = {
      name: "👤 Отправитель Discord",
      value: `${senderMention}\n**Username:** ${displayName}\n**Discord ID:** \`${senderId}\``,
      inline: false
    };

    const fieldGroups = splitIntoEmbeds(buildFields(current, req.body, senderField));

    for (let index = 0; index < fieldGroups.length; index += 1) {
      const first = index === 0;
      const partSuffix = fieldGroups.length > 1
        ? ` • часть ${index + 1}/${fieldGroups.length}`
        : "";

      await axios.post(webhook, {
        username: "EMS | Недельные отчёты",
        content: first && roleMentions ? roleMentions : undefined,
        allowed_mentions: {
          parse: [],
          roles: first ? roles : []
        },
        embeds: [{
          title: (
            isSenior
              ? "📋 Недельный отчёт старшего состава"
              : `📋 Недельный отчёт ${department}`
          ) + partSuffix,
          color: isSenior ? 15158332 : 3447003,
          description: [
            `**Отдел:** ${department}`,
            `**Ранг:** ${rank} | ${rankNames[rank]}`,
            fieldGroups.length > 1 ? `**Часть отчёта:** ${index + 1}/${fieldGroups.length}` : null
          ].filter(Boolean).join("\n"),
          fields: fieldGroups[index],
          timestamp: new Date().toISOString(),
          footer: { text: "EMS Majestic RP • Weekly Report" }
        }]
      });
    }

    res.render("weekly-report-success", {
      department,
      rank,
      rankName: rankNames[rank],
      isSenior
    });

  }catch(error){
    console.error(
      "Weekly report error:",
      JSON.stringify(
        error.response?.data || { message: error.message, stack: error.stack },
        null,
        2
      )
    );

    res.status(500).send(
      "Не удалось отправить недельный отчёт. " +
      "Произошла ошибка при обработке данных. " +
      "Попробуйте ещё раз или сообщите старшему составу EMS."
    );
  }
});

module.exports = router;
