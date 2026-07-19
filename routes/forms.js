const express = require("express");
const axios = require("axios");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Проверка авторизации
|--------------------------------------------------------------------------
*/

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect("/auth/discord");
    }

    return next();
}

/*
|--------------------------------------------------------------------------
| Настройки форм отпусков
|--------------------------------------------------------------------------
*/

const vacationForms = {
    "vacation-ooc": {
        slug: "vacation-ooc",
        type: "OOC",
        title: "Заявление на OOC-отпуск",
        description: "Отпуск по причинам вне игрового процесса.",
        webhookEnv: "OOC_VACATION_WEBHOOK_URL",
        color: 3447003
    },

    "vacation-ic": {
        slug: "vacation-ic",
        type: "IC",
        title: "Заявление на IC-отпуск",
        description: "Отпуск по внутриигровой причине.",
        webhookEnv: "IC_VACATION_WEBHOOK_URL",
        color: 10181046
    }
};

/*
|--------------------------------------------------------------------------
| Отделы и переменные окружения с их ролями
|--------------------------------------------------------------------------
*/

const departmentRoleVariables = {
    SD: "SD_VACATION_ROLE_IDS",
    EMT: "EMT_VACATION_ROLE_IDS",
    PSED: "PSED_VACATION_ROLE_IDS",
    HAD: "HAD_VACATION_ROLE_IDS",
    PM: "PM_VACATION_ROLE_IDS",
    DI: "DI_VACATION_ROLE_IDS"
};

/*
|--------------------------------------------------------------------------
| Ранги
|--------------------------------------------------------------------------
*/

const ranks = [
    {
        value: 3,
        label: "3 — Фельдшер"
    },
    {
        value: 4,
        label: "4 — Старший фельдшер"
    },
    {
        value: 5,
        label: "5 — Реаниматолог"
    },
    {
        value: 6,
        label: "6 — Терапевт"
    },
    {
        value: 7,
        label: "7 — Психиатр"
    },
    {
        value: 8,
        label: "8 — Анестезиолог"
    },
    {
        value: 9,
        label: "9 — Невролог"
    },
    {
        value: 10,
        label: "10 — Врач высшей категории"
    },
    {
        value: 11,
        label: "11 — Инструктор"
    },
    {
        value: 12,
        label: "12 — Заместитель заведующего"
    },
    {
        value: 13,
        label: "13 — Заведующий отделением"
    }
];

/*
|--------------------------------------------------------------------------
| GET /forms/vacation-ooc
| GET /forms/vacation-ic
|--------------------------------------------------------------------------
*/

router.get("/:formType", requireAuth, (req, res, next) => {
    const config = vacationForms[req.params.formType];

    if (!config) {
        return next();
    }

    return renderVacationPage(res, req, config, {
        success: false,
        error: null,
        formData: {}
    });
});

/*
|--------------------------------------------------------------------------
| POST /forms/vacation-ooc
| POST /forms/vacation-ic
|--------------------------------------------------------------------------
*/

router.post("/:formType", requireAuth, async (req, res, next) => {
    const config = vacationForms[req.params.formType];

    if (!config) {
        return next();
    }

    const formData = {
        characterInfo: cleanText(req.body.characterInfo),
        department: cleanText(req.body.department).toUpperCase(),
        rank: cleanText(req.body.rank),
        startDate: cleanText(req.body.startDate),
        endDate: cleanText(req.body.endDate),
        reason: cleanText(req.body.reason)
    };

    const {
        characterInfo,
        department,
        rank,
        startDate,
        endDate,
        reason
    } = formData;

    /*
    |--------------------------------------------------------------------------
    | Проверка заполнения
    |--------------------------------------------------------------------------
    */

    if (
        !characterInfo ||
        !department ||
        !rank ||
        !startDate ||
        !endDate ||
        !reason
    ) {
        return renderVacationError(
            res,
            req,
            config,
            formData,
            400,
            "Заполните все обязательные поля."
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Проверка длины
    |--------------------------------------------------------------------------
    */

    if (characterInfo.length > 150) {
        return renderVacationError(
            res,
            req,
            config,
            formData,
            400,
            "Поле «Имя Фамилия | Статик» слишком длинное."
        );
    }

    if (reason.length > 1000) {
        return renderVacationError(
            res,
            req,
            config,
            formData,
            400,
            "Причина не должна превышать 1000 символов."
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Проверка отдела
    |--------------------------------------------------------------------------
    */

    const departmentRoleVariable =
        departmentRoleVariables[department];

    if (!departmentRoleVariable) {
        return renderVacationError(
            res,
            req,
            config,
            formData,
            400,
            "Выберите корректный отдел."
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Проверка ранга
    |--------------------------------------------------------------------------
    */

    const numericRank = Number(rank);

    const selectedRank = ranks.find(
        (rankItem) => rankItem.value === numericRank
    );

    if (!selectedRank) {
        return renderVacationError(
            res,
            req,
            config,
            formData,
            400,
            "Выберите корректный ранг от 3 до 13."
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Проверка дат
    |--------------------------------------------------------------------------
    */

    const startDateObject = parseDate(startDate);
    const endDateObject = parseDate(endDate);

    if (!startDateObject || !endDateObject) {
        return renderVacationError(
            res,
            req,
            config,
            formData,
            400,
            "Укажите корректные даты отпуска."
        );
    }

    if (endDateObject < startDateObject) {
        return renderVacationError(
            res,
            req,
            config,
            formData,
            400,
            "Дата окончания не может быть раньше даты начала."
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Получение webhook
    |--------------------------------------------------------------------------
    */

    const webhookUrl = cleanText(
        process.env[config.webhookEnv]
    );

    if (!webhookUrl) {
        console.error(
            `Не настроена переменная ${config.webhookEnv}`
        );

        return renderVacationError(
            res,
            req,
            config,
            formData,
            500,
            `Webhook для ${config.type}-отпуска не настроен.`
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Выбор тегаемых ролей
    |--------------------------------------------------------------------------
    |
    | Ранг 3–10:
    | только две роли выбранного отдела.
    |
    | Ранг 11–13:
    | только Главный врач и Заместитель Главного врача.
    | Роли отдела не добавляются.
    |
    */

    let roleIdsToMention;

    if (numericRank >= 11) {
        const chiefDoctorRoleId = cleanText(
            process.env.CHIEF_DOCTOR_ROLE_ID
        );

        const deputyChiefDoctorRoleId = cleanText(
            process.env.DEPUTY_CHIEF_DOCTOR_ROLE_ID
        );

        if (
            !isValidDiscordId(chiefDoctorRoleId) ||
            !isValidDiscordId(deputyChiefDoctorRoleId)
        ) {
            console.error(
                "Некорректно настроены CHIEF_DOCTOR_ROLE_ID " +
                "или DEPUTY_CHIEF_DOCTOR_ROLE_ID."
            );

            return renderVacationError(
                res,
                req,
                config,
                formData,
                500,
                "Не настроены роли Главного врача и его заместителя."
            );
        }

        roleIdsToMention = [
            chiefDoctorRoleId,
            deputyChiefDoctorRoleId
        ];
    } else {
        const departmentRoleIds = parseRoleIds(
            process.env[departmentRoleVariable]
        );

        if (departmentRoleIds.length !== 2) {
            console.error(
                `Переменная ${departmentRoleVariable} должна ` +
                "содержать ровно два Discord ID."
            );

            return renderVacationError(
                res,
                req,
                config,
                formData,
                500,
                `Для отдела ${department} должны быть настроены две роли.`
            );
        }

        if (!departmentRoleIds.every(isValidDiscordId)) {
            console.error(
                `В переменной ${departmentRoleVariable} ` +
                "обнаружен некорректный Discord ID."
            );

            return renderVacationError(
                res,
                req,
                config,
                formData,
                500,
                `Роли отдела ${department} настроены некорректно.`
            );
        }

        roleIdsToMention = departmentRoleIds;
    }

    const uniqueRoleIds = [...new Set(roleIdsToMention)];

    if (uniqueRoleIds.length !== 2) {
        return renderVacationError(
            res,
            req,
            config,
            formData,
            500,
            "Уведомляемые роли должны иметь разные Discord ID."
        );
    }

    const roleMentions = uniqueRoleIds
        .map((roleId) => `<@&${roleId}>`)
        .join(" ");

    /*
    |--------------------------------------------------------------------------
    | Информация о Discord-пользователе
    |--------------------------------------------------------------------------
    */

    const discordUserId = cleanText(req.session.user.id);

    const discordDisplayName =
        cleanText(req.session.user.global_name) ||
        cleanText(req.session.user.username) ||
        "Пользователь Discord";

    /*
    |--------------------------------------------------------------------------
    | Данные Discord webhook
    |--------------------------------------------------------------------------
    */

    const payload = {
        username: "EMS Adam Forms",

        content: roleMentions,

        allowed_mentions: {
            parse: [],
            roles: uniqueRoleIds,
            users: discordUserId ? [discordUserId] : []
        },

        embeds: [
            {
                title: config.title,
                description: config.description,
                color: config.color,
                timestamp: new Date().toISOString(),

                author: {
                    name: discordDisplayName
                },

                fields: [
                    {
                        name: "Discord",
                        value: discordUserId
                            ? `<@${discordUserId}>`
                            : "Не определён",
                        inline: true
                    },
                    {
                        name: "Discord ID",
                        value: discordUserId || "Не определён",
                        inline: true
                    },
                    {
                        name: "Тип отпуска",
                        value: config.type,
                        inline: true
                    },
                    {
                        name: "Имя Фамилия | Статик",
                        value: limitDiscordField(characterInfo),
                        inline: false
                    },
                    {
                        name: "Отдел",
                        value: department,
                        inline: true
                    },
                    {
                        name: "Ранг",
                        value: selectedRank.label,
                        inline: true
                    },
                    {
                        name: "Дата начала",
                        value: formatDate(startDate),
                        inline: true
                    },
                    {
                        name: "Дата окончания",
                        value: formatDate(endDate),
                        inline: true
                    },
                    {
                        name: "Причина",
                        value: limitDiscordField(reason),
                        inline: false
                    }
                ],

                footer: {
                    text: "EMS Adam Forms"
                }
            }
        ]
    };

    /*
    |--------------------------------------------------------------------------
    | Отправка в Discord
    |--------------------------------------------------------------------------
    */

    try {
        await axios.post(webhookUrl, payload, {
            timeout: 10000,
            headers: {
                "Content-Type": "application/json"
            }
        });

        return renderVacationPage(res, req, config, {
            success: true,
            error: null,
            formData: {}
        });
    } catch (error) {
        console.error(
            `Ошибка отправки ${config.type}-отпуска:`,
            error.response?.data || error.message
        );

        return renderVacationError(
            res,
            req,
            config,
            formData,
            500,
            "Не удалось отправить заявление в Discord."
        );
    }
});

/*
|--------------------------------------------------------------------------
| Вспомогательные функции
|--------------------------------------------------------------------------
*/

function cleanText(value) {
    return String(value || "").trim();
}

function parseRoleIds(value) {
    return cleanText(value)
        .split(",")
        .map((roleId) => roleId.trim())
        .filter(Boolean);
}

function isValidDiscordId(value) {
    return /^\d{17,20}$/.test(cleanText(value));
}

function parseDate(value) {
    const dateString = cleanText(value);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return null;
    }

    const [year, month, day] = dateString
        .split("-")
        .map(Number);

    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function formatDate(value) {
    const date = parseDate(value);

    if (!date) {
        return "Некорректная дата";
    }

    return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(date);
}

function limitDiscordField(value) {
    const text = cleanText(value);

    return text
        ? text.slice(0, 1024)
        : "Не указано";
}

function renderVacationPage(
    res,
    req,
    config,
    {
        success = false,
        error = null,
        formData = {},
        statusCode = 200
    } = {}
) {
    return res.status(statusCode).render("vacation", {
        user: req.session.user,
        config,
        departments: Object.keys(
            departmentRoleVariables
        ),
        ranks,
        success,
        error,
        formData
    });
}

function renderVacationError(
    res,
    req,
    config,
    formData,
    statusCode,
    message
) {
    return renderVacationPage(res, req, config, {
        success: false,
        error: message,
        formData,
        statusCode
    });
}

module.exports = router;