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
    ["reattestations","Переаттестации (ссылка | количество)",0]
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

function auth(req,res,next){
  if(!req.session?.user) return res.redirect("/");
  next();
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

    const missing = current.filter(
      x => x[2] && !String(req.body[x[0]] || "").trim()
    );

    if (missing.length) {
      return res
        .status(400)
        .send(
          "Не заполнены обязательные поля: " +
          missing.map(x => x[1]).join(", ")
        );
    }

    let webhookKey;
    let roles = [];

    if (rank <= 10) {
      // 3–10: канал отдела + заведующий/заместитель отдела
      webhookKey = config[department][0];

      roles = [
        process.env[config[department][1]],
        process.env[config[department][2]]
      ].filter(Boolean);

    } else if (rank === 11) {
      // 11: канал старшего состава + заведующий/заместитель выбранного отдела
      webhookKey = "WEEKLY_SENIOR_WEBHOOK_URL";

      roles = [
        process.env[config[department][1]],
        process.env[config[department][2]]
      ].filter(Boolean);

    } else {
      // 12–13: канал старшего состава + главный врач/заместитель главного врача
      webhookKey = "WEEKLY_SENIOR_WEBHOOK_URL";

      roles = [
        process.env.CHIEF_DOCTOR_ROLE_ID,
        process.env.DEPUTY_CHIEF_DOCTOR_ROLE_ID
      ].filter(Boolean);
    }

    const webhook = process.env[webhookKey];

    if (!webhook) {
      throw new Error("Webhook не настроен: " + webhookKey);
    }

    const user = req.session.user;
    const displayName =
      user.global_name ||
      user.username ||
      "Неизвестно";

    const senderId = String(user.id);
    const senderMention = `<@${senderId}>`;

    // В обычном content оставляем только роли руководства,
    // чтобы сам сотрудник не получал отдельный ping над embed.
    const roleMentions = roles
      .map(id => `<@&${id}>`)
      .join(" ");

    const reportFields = [
      {
        name: "👤 Отправитель Discord",
        value: `${senderMention}\n**Username:** ${displayName}\n**Discord ID:** \`${senderId}\``,
        inline: false
      },
      ...current.map(([name, label]) => ({
        name: label,
        value: String(req.body[name] || "—").trim() || "—",
        inline: false
      }))
    ];

    await axios.post(webhook, {
      username: "EMS | Недельные отчёты",

      // Реальные уведомления руководству остаются здесь.
      // Отправителя здесь больше нет.
      content: roleMentions || undefined,

      allowed_mentions: {
        parse: [],
        roles
      },

      embeds: [{
        title: isSenior
          ? "📋 Недельный отчёт старшего состава"
          : `📋 Недельный отчёт ${department}`,

        color: isSenior
          ? 15158332
          : 3447003,

        description: [
          `**Отдел:** ${department}`,
          `**Ранг:** ${rank} | ${rankNames[rank]}`
        ].join("\n"),

        fields: reportFields,

        timestamp: new Date().toISOString(),

        footer: {
          text: "EMS Majestic RP • Weekly Report"
        }
      }]
    });

    res.render("weekly-report-success", {
      department,
      rank,
      rankName: rankNames[rank],
      isSenior
    });
  }catch(error){
    console.error("Weekly report error:",error.response?.data||error);
    res.status(500).send("Не удалось отправить недельный отчёт. Проверьте webhook/role ID.");
  }
});

module.exports = router;
