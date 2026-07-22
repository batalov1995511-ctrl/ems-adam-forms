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

    next();
}

/*
|--------------------------------------------------------------------------
| Вспомогательные функции
|--------------------------------------------------------------------------
*/

function cleanText(value) {
    return String(value ?? "").trim();
}

/*
 * Преобразует строку с одной или несколькими ролями в массив ID.
 *
 * Допустимые варианты в .env:
 *
 * EMT_TRANSFER_ROLE_ID=123456789012345678
 *
 * EMT_TRANSFER_ROLE_ID=123456789012345678,987654321098765432
 *
 * Также функция удалит лишние пробелы и символы упоминания:
 *
 * EMT_TRANSFER_ROLE_ID=<@&123456789012345678>, <@&987654321098765432>
 */
function cleanRoleIds(value) {
    return cleanText(value)
        .split(",")
        .map((roleId) => {
            return roleId
                .replace(/[<@&>]/g, "")
                .trim();
        })
        .filter((roleId) => {
            return /^\d{17,20}$/.test(roleId);
        });
}

function renderForm(res, user, options = {}) {
    return res.render("department-transfer", {
        user,
        success: options.success || false,
        error: options.error || null,
        formData: options.formData || {}
    });
}

/*
|--------------------------------------------------------------------------
| Доступные отделы
|--------------------------------------------------------------------------
*/

const allowedSourceDepartments = [
    "HAD",
    "PM",
    "SD",
    "EMT",
    "DI",
    "PSED"
];

const allowedTargetDepartments = [
    "HAD",
    "SD",
    "EMT",
    "DI",
    "PSED"
];

/*
|--------------------------------------------------------------------------
| Настройки принимающих отделов
|--------------------------------------------------------------------------
|
| Для каждого отдела используются:
|
| 1. Отдельный Discord Webhook.
| 2. Одна или несколько Discord-ролей.
| 3. Отдельный цвет Embed.
|
*/

function getDepartmentConfig() {
    return {
        HAD: {
            webhookUrl: cleanText(
                process.env.HAD_TRANSFER_WEBHOOK_URL
            ),

            roleIds: cleanRoleIds(
                process.env.HAD_TRANSFER_ROLE_ID
            ),

            color: 15844367
        },

        SD: {
            webhookUrl: cleanText(
                process.env.SD_TRANSFER_WEBHOOK_URL
            ),

            roleIds: cleanRoleIds(
                process.env.SD_TRANSFER_ROLE_ID
            ),

            color: 15158332
        },

        EMT: {
            webhookUrl: cleanText(
                process.env.EMT_TRANSFER_WEBHOOK_URL
            ),

            roleIds: cleanRoleIds(
                process.env.EMT_TRANSFER_ROLE_ID
            ),

            color: 3447003
        },

        DI: {
            webhookUrl: cleanText(
                process.env.DI_TRANSFER_WEBHOOK_URL
            ),

            roleIds: cleanRoleIds(
                process.env.DI_TRANSFER_ROLE_ID
            ),

            color: 10181046
        },

        PSED: {
            webhookUrl: cleanText(
                process.env.PSED_TRANSFER_WEBHOOK_URL
            ),

            roleIds: cleanRoleIds(
                process.env.PSED_TRANSFER_ROLE_ID
            ),

            color: 5763719
        }
    };
}

/*
|--------------------------------------------------------------------------
| Открытие страницы формы
|--------------------------------------------------------------------------
|
| При подключении маршрута через:
|
| app.use("/forms", departmentTransferRoutes);
|
| адрес страницы:
|
| GET /forms/department-transfer
|
*/

router.get(
    "/department-transfer",
    requireAuth,
    (req, res) => {
        return renderForm(
            res,
            req.session.user
        );
    }
);

/*
|--------------------------------------------------------------------------
| Отправка заявки
|--------------------------------------------------------------------------
|
| POST /forms/department-transfer
|
*/

router.post(
    "/department-transfer",
    requireAuth,
    async (req, res) => {
        const formData = {
            employeeName: cleanText(
                req.body?.employeeName
            ),

            fromDepartment: cleanText(
                req.body?.fromDepartment
            ).toUpperCase(),

            toDepartment: cleanText(
                req.body?.toDepartment
            ).toUpperCase(),

            onlineAndPrime: cleanText(
                req.body?.onlineAndPrime
            ),

            flightSkill: cleanText(
                req.body?.flightSkill
            ),

            developmentIdeas: cleanText(
                req.body?.developmentIdeas
            )
        };

        /*
         * Проверка обязательных полей.
         */
        if (
            !formData.employeeName
            || !formData.fromDepartment
            || !formData.toDepartment
            || !formData.onlineAndPrime
        ) {
            return res.status(400).render(
                "department-transfer",
                {
                    user: req.session.user,
                    success: false,
                    error:
                        "Заполните все обязательные поля.",
                    formData
                }
            );
        }

        /*
         * Ограничение длины поля с именем.
         */
        if (formData.employeeName.length > 120) {
            return res.status(400).render(
                "department-transfer",
                {
                    user: req.session.user,
                    success: false,
                    error:
                        "Поле «Фамилия Имя | Статик» содержит слишком много символов.",
                    formData
                }
            );
        }

        /*
         * Ограничение длины информации об онлайне.
         */
        if (formData.onlineAndPrime.length > 600) {
            return res.status(400).render(
                "department-transfer",
                {
                    user: req.session.user,
                    success: false,
                    error:
                        "Поле со среднесуточным онлайном содержит слишком много символов.",
                    formData
                }
            );
        }

        /*
         * Ограничение длины поля с идеями.
         */
        if (formData.developmentIdeas.length > 1500) {
            return res.status(400).render(
                "department-transfer",
                {
                    user: req.session.user,
                    success: false,
                    error:
                        "Поле с идеями содержит слишком много символов.",
                    formData
                }
            );
        }

        /*
         * Проверка исходного отдела.
         */
        if (
            !allowedSourceDepartments.includes(
                formData.fromDepartment
            )
        ) {
            return res.status(400).render(
                "department-transfer",
                {
                    user: req.session.user,
                    success: false,
                    error:
                        "Выбран недопустимый исходный отдел.",
                    formData
                }
            );
        }

        /*
         * Проверка принимающего отдела.
         *
         * PM отсутствует в списке принимающих отделов,
         * поэтому подать заявку на перевод в PM нельзя.
         */
        if (
            !allowedTargetDepartments.includes(
                formData.toDepartment
            )
        ) {
            return res.status(400).render(
                "department-transfer",
                {
                    user: req.session.user,
                    success: false,
                    error:
                        "Выбран недопустимый отдел назначения.",
                    formData
                }
            );
        }

        /*
         * Запрет перевода в тот же отдел.
         */
        if (
            formData.fromDepartment
            === formData.toDepartment
        ) {
            return res.status(400).render(
                "department-transfer",
                {
                    user: req.session.user,
                    success: false,
                    error:
                        "Нельзя подать заявку на перевод в тот же отдел.",
                    formData
                }
            );
        }

        /*
         * Проверка навыка полёта для EMT.
         */
        if (formData.toDepartment === "EMT") {
            const flightSkillNumber =
                Number(formData.flightSkill);

            if (
                formData.flightSkill === ""
                || !Number.isFinite(flightSkillNumber)
                || flightSkillNumber < 0
                || flightSkillNumber > 100
            ) {
                return res.status(400).render(
                    "department-transfer",
                    {
                        user: req.session.user,
                        success: false,
                        error:
                            "Для перевода в EMT укажите процент навыка полёта от 0 до 100.",
                        formData
                    }
                );
            }

            formData.flightSkill =
                String(
                    Math.round(flightSkillNumber)
                );
        } else {
            /*
             * Для остальных отделов навык полёта
             * не используется.
             */
            formData.flightSkill = "";
        }

        const departmentConfig =
            getDepartmentConfig();

        const targetConfig =
            departmentConfig[
                formData.toDepartment
            ];

        /*
         * Проверка настроек отдела.
         */
        if (
            !targetConfig
            || !targetConfig.webhookUrl
            || !Array.isArray(targetConfig.roleIds)
            || targetConfig.roleIds.length === 0
        ) {
            console.error(
                "Некорректные настройки принимающего отдела:",
                {
                    department:
                        formData.toDepartment,

                    hasWebhook:
                        Boolean(
                            targetConfig?.webhookUrl
                        ),

                    roleIds:
                        targetConfig?.roleIds
                }
            );

            return res.status(500).render(
                "department-transfer",
                {
                    user: req.session.user,
                    success: false,
                    error:
                        `Для отдела ${formData.toDepartment} неправильно настроены Webhook или ID ролей.`,
                    formData
                }
            );
        }

        const discordUser =
            req.session.user;

        const discordName =
            cleanText(
                discordUser.global_name
                || discordUser.username
                || "Пользователь Discord"
            );

        /*
         * Необязательная картинка Webhook.
         */
        const webhookAvatarUrl =
            cleanText(
                process.env.HR_WEBHOOK_AVATAR_URL
            );

        /*
         * Формирование полей Embed.
         */
        const embedFields = [
            {
                name: "Discord",

                value:
                    `<@${discordUser.id}>`,

                inline: true
            },

            {
                name: "Discord ID",

                value:
                    String(discordUser.id),

                inline: true
            },

            {
                name:
                    "Фамилия Имя | Статик",

                value:
                    formData.employeeName.slice(
                        0,
                        1024
                    ),

                inline: false
            },

            {
                name:
                    "Из какого отдела переводится",

                value:
                    formData.fromDepartment,

                inline: true
            },

            {
                name:
                    "В какой отдел переводится",

                value:
                    formData.toDepartment,

                inline: true
            },

            {
                name:
                    "Среднесуточный онлайн и прайм-тайм",

                value:
                    formData.onlineAndPrime.slice(
                        0,
                        1024
                    ),

                inline: false
            }
        ];

        /*
         * Поле с навыком полёта добавляется
         * только для заявок в EMT.
         */
        if (formData.toDepartment === "EMT") {
            embedFields.push({
                name: "Навык полёта",

                value:
                    `${formData.flightSkill}%`,

                inline: true
            });
        }

        /*
         * Необязательное поле с идеями.
         */
        embedFields.push({
            name:
                "Идеи по развитию отдела и чем собирается заниматься",

            value:
                formData.developmentIdeas
                    ? formData.developmentIdeas.slice(
                        0,
                        1024
                    )
                    : "Не указано",

            inline: false
        });

        /*
         * Преобразуем массив ID ролей в строку
         * с Discord-упоминаниями.
         *
         * Результат:
         *
         * <@&ROLE_ID_1> <@&ROLE_ID_2>
         */
        const roleMentions =
            targetConfig.roleIds
                .map((roleId) => {
                    return `<@&${roleId}>`;
                })
                .join(" ");

        /*
         * Формирование тела Discord Webhook.
         */
        const webhookPayload = {
            username:
                "EMS | Отдел кадров",

            /*
             * Упоминание всех ролей,
             * указанных для выбранного отдела.
             */
            content:
                roleMentions,

            allowed_mentions: {
                parse: [],

                roles:
                    targetConfig.roleIds
            },

            embeds: [
                {
                    title:
                        `Новая заявка на перевод в отдел ${formData.toDepartment}`,

                    description:
                        `Сотрудник подал заявку на перевод из отдела **${formData.fromDepartment}** в отдел **${formData.toDepartment}**.`,

                    color:
                        targetConfig.color,

                    timestamp:
                        new Date().toISOString(),

                    author: {
                        name:
                            discordName
                    },

                    fields:
                        embedFields,

                    footer: {
                        text:
                            "EMS Adam Forms"
                    }
                }
            ]
        };

        /*
         * Добавляем аватар только тогда,
         * когда переменная заполнена.
         */
        if (webhookAvatarUrl) {
            webhookPayload.avatar_url =
                webhookAvatarUrl;
        }

        /*
         * Информация для проверки перед отправкой.
         *
         * Здесь не выводится сам Webhook URL,
         * чтобы он случайно не попал в логи.
         */
        console.log(
            "Отправка заявки на перевод:",
            {
                targetDepartment:
                    formData.toDepartment,

                roleIds:
                    targetConfig.roleIds,

                roleMentions,

                hasWebhook:
                    Boolean(
                        targetConfig.webhookUrl
                    )
            }
        );

        /*
         * Отправка заявки в Discord.
         */
        try {
            await axios.post(
                targetConfig.webhookUrl,
                webhookPayload,
                {
                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    timeout: 15000
                }
            );

            console.log(
                "Заявка на перевод успешно отправлена:",
                {
                    discordName,

                    discordId:
                        discordUser.id,

                    fromDepartment:
                        formData.fromDepartment,

                    toDepartment:
                        formData.toDepartment
                }
            );

            return renderForm(
                res,
                req.session.user,
                {
                    success:
                        `Заявка на перевод в отдел ${formData.toDepartment} успешно отправлена.`,

                    formData: {}
                }
            );
        } catch (error) {
            console.error(
                "Ошибка отправки заявки на перевод:",
                {
                    message:
                        error.message,

                    status:
                        error.response?.status,

                    data:
                        error.response?.data,

                    targetDepartment:
                        formData.toDepartment,

                    roleIds:
                        targetConfig.roleIds
                }
            );

            return res.status(500).render(
                "department-transfer",
                {
                    user:
                        req.session.user,

                    success:
                        false,

                    error:
                        "Не удалось отправить заявку в Discord. Попробуйте ещё раз позднее.",

                    formData
                }
            );
        }
    }
);

module.exports = router;