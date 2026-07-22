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
 * Очищает Discord Role ID.
 *
 * Допустимые варианты в .env:
 *
 * PM_HEAD_ROLE_ID=123456789012345678
 *
 * PM_HEAD_ROLE_ID=<@&123456789012345678>
 */
function cleanRoleId(value) {
    const roleId = cleanText(value)
        .replace(/[<@&>]/g, "")
        .trim();

    if (!/^\d{17,20}$/.test(roleId)) {
        return null;
    }

    return roleId;
}

/*
 * Удаляет повторяющиеся и пустые ID ролей.
 */
function getUniqueRoleIds(roleIds) {
    return [
        ...new Set(
            roleIds.filter(Boolean)
        )
    ];
}

function renderForm(res, user, options = {}) {
    return res.render(
        "staff-department-transfer",
        {
            user,
            success:
                options.success || false,

            error:
                options.error || null,

            formData:
                options.formData || {}
        }
    );
}

/*
|--------------------------------------------------------------------------
| Доступные отделы
|--------------------------------------------------------------------------
*/

const allowedDepartments = [
    "HAD",
    "PM",
    "SD",
    "EMT",
    "DI",
    "PSED"
];

/*
|--------------------------------------------------------------------------
| Настройки отделов
|--------------------------------------------------------------------------
|
| Для каждого отдела указываются:
|
| 1. ID роли начальника отдела.
| 2. ID роли заместителя начальника отдела.
|
| При переводе сотрудника будут упомянуты роли
| исходного и принимающего отделов.
|
*/

function getDepartmentConfig() {
    return {
        HAD: {
            headRoleId:
                cleanRoleId(
                    process.env.HAD_HEAD_ROLE_ID
                ),

            deputyRoleId:
                cleanRoleId(
                    process.env.HAD_DEPUTY_ROLE_ID
                ),

            color: 15844367
        },

        PM: {
            headRoleId:
                cleanRoleId(
                    process.env.PM_HEAD_ROLE_ID
                ),

            deputyRoleId:
                cleanRoleId(
                    process.env.PM_DEPUTY_ROLE_ID
                ),

            color: 16753920
        },

        SD: {
            headRoleId:
                cleanRoleId(
                    process.env.SD_HEAD_ROLE_ID
                ),

            deputyRoleId:
                cleanRoleId(
                    process.env.SD_DEPUTY_ROLE_ID
                ),

            color: 15158332
        },

        EMT: {
            headRoleId:
                cleanRoleId(
                    process.env.EMT_HEAD_ROLE_ID
                ),

            deputyRoleId:
                cleanRoleId(
                    process.env.EMT_DEPUTY_ROLE_ID
                ),

            color: 3447003
        },

        DI: {
            headRoleId:
                cleanRoleId(
                    process.env.DI_HEAD_ROLE_ID
                ),

            deputyRoleId:
                cleanRoleId(
                    process.env.DI_DEPUTY_ROLE_ID
                ),

            color: 10181046
        },

        PSED: {
            headRoleId:
                cleanRoleId(
                    process.env.PSED_HEAD_ROLE_ID
                ),

            deputyRoleId:
                cleanRoleId(
                    process.env.PSED_DEPUTY_ROLE_ID
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
| app.use("/forms", staffDepartmentTransferRoutes);
|
| адрес страницы:
|
| GET /forms/staff-department-transfer
|
*/

router.get(
    "/staff-department-transfer",
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
| Отправка служебного перевода
|--------------------------------------------------------------------------
|
| POST /forms/staff-department-transfer
|
*/

router.post(
    "/staff-department-transfer",
    requireAuth,
    async (req, res) => {
        const formData = {
            fromDepartment:
                cleanText(
                    req.body?.fromDepartment
                ).toUpperCase(),

            toDepartment:
                cleanText(
                    req.body?.toDepartment
                ).toUpperCase(),

            employeeName:
                cleanText(
                    req.body?.employeeName
                )
        };

        /*
         * Проверка обязательных полей.
         */
        if (
            !formData.fromDepartment
            || !formData.toDepartment
            || !formData.employeeName
        ) {
            return res.status(400).render(
                "staff-department-transfer",
                {
                    user:
                        req.session.user,

                    success:
                        false,

                    error:
                        "Заполните все обязательные поля.",

                    formData
                }
            );
        }

        /*
         * Ограничение длины поля
         * «Имя Фамилия | Статик».
         */
        if (formData.employeeName.length > 120) {
            return res.status(400).render(
                "staff-department-transfer",
                {
                    user:
                        req.session.user,

                    success:
                        false,

                    error:
                        "Поле «Имя Фамилия | Статик» содержит слишком много символов.",

                    formData
                }
            );
        }

        /*
         * Проверка исходного отдела.
         */
        if (
            !allowedDepartments.includes(
                formData.fromDepartment
            )
        ) {
            return res.status(400).render(
                "staff-department-transfer",
                {
                    user:
                        req.session.user,

                    success:
                        false,

                    error:
                        "Выбран недопустимый исходный отдел.",

                    formData
                }
            );
        }

        /*
         * Проверка принимающего отдела.
         */
        if (
            !allowedDepartments.includes(
                formData.toDepartment
            )
        ) {
            return res.status(400).render(
                "staff-department-transfer",
                {
                    user:
                        req.session.user,

                    success:
                        false,

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
                "staff-department-transfer",
                {
                    user:
                        req.session.user,

                    success:
                        false,

                    error:
                        "Нельзя перевести сотрудника в тот же отдел.",

                    formData
                }
            );
        }

        const webhookUrl =
            cleanText(
                process.env
                    .STAFF_TRANSFER_WEBHOOK_URL
            );

        /*
         * Проверка общего Webhook.
         */
        if (!webhookUrl) {
            console.error(
                "Переменная STAFF_TRANSFER_WEBHOOK_URL не настроена."
            );

            return res.status(500).render(
                "staff-department-transfer",
                {
                    user:
                        req.session.user,

                    success:
                        false,

                    error:
                        "Webhook для служебных переводов не настроен.",

                    formData
                }
            );
        }

        const departmentConfig =
            getDepartmentConfig();

        const sourceConfig =
            departmentConfig[
                formData.fromDepartment
            ];

        const targetConfig =
            departmentConfig[
                formData.toDepartment
            ];

        /*
         * Проверка наличия конфигурации отделов.
         */
        if (!sourceConfig || !targetConfig) {
            console.error(
                "Не найдена конфигурация отдела:",
                {
                    fromDepartment:
                        formData.fromDepartment,

                    toDepartment:
                        formData.toDepartment
                }
            );

            return res.status(500).render(
                "staff-department-transfer",
                {
                    user:
                        req.session.user,

                    success:
                        false,

                    error:
                        "Не удалось получить настройки выбранных отделов.",

                    formData
                }
            );
        }

        /*
         * Собираем четыре роли:
         *
         * 1. Начальник исходного отдела.
         * 2. Заместитель исходного отдела.
         * 3. Начальник принимающего отдела.
         * 4. Заместитель принимающего отдела.
         */
        const roleIds =
            getUniqueRoleIds([
                sourceConfig.headRoleId,
                sourceConfig.deputyRoleId,
                targetConfig.headRoleId,
                targetConfig.deputyRoleId
            ]);

        /*
         * Проверяем, что все четыре роли настроены.
         */
        const missingRoles = [];

        if (!sourceConfig.headRoleId) {
            missingRoles.push(
                `${formData.fromDepartment}_HEAD_ROLE_ID`
            );
        }

        if (!sourceConfig.deputyRoleId) {
            missingRoles.push(
                `${formData.fromDepartment}_DEPUTY_ROLE_ID`
            );
        }

        if (!targetConfig.headRoleId) {
            missingRoles.push(
                `${formData.toDepartment}_HEAD_ROLE_ID`
            );
        }

        if (!targetConfig.deputyRoleId) {
            missingRoles.push(
                `${formData.toDepartment}_DEPUTY_ROLE_ID`
            );
        }

        if (missingRoles.length > 0) {
            console.error(
                "Не настроены роли для служебного перевода:",
                {
                    missingRoles,

                    fromDepartment:
                        formData.fromDepartment,

                    toDepartment:
                        formData.toDepartment
                }
            );

            return res.status(500).render(
                "staff-department-transfer",
                {
                    user:
                        req.session.user,

                    success:
                        false,

                    error:
                        `Не настроены роли руководства выбранных отделов: ${missingRoles.join(", ")}.`,

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
         * Преобразуем ID ролей
         * в Discord-упоминания.
         */
        const roleMentions =
            roleIds
                .map((roleId) => {
                    return `<@&${roleId}>`;
                })
                .join(" ");

        /*
         * Цвет Embed берётся из настроек
         * принимающего отдела.
         */
        const embedColor =
            targetConfig.color || 16753920;

        /*
         * Формирование тела Discord Webhook.
         */
        const webhookPayload = {
            username:
                "EMS | Отдел кадров",

            content:
                roleMentions,

            allowed_mentions: {
                parse: [],

                roles:
                    roleIds
            },

            embeds: [
                {
                    title:
                        "Запрос на перевод",

                    description:
                        `Оформлен служебный перевод сотрудника из отдела **${formData.fromDepartment}** в отдел **${formData.toDepartment}**.`,

                    color:
                        embedColor,

                    timestamp:
                        new Date().toISOString(),

                    author: {
                        name:
                            discordName
                    },

                    fields: [
                        {
                            name:
                                "Из какого отдела переводится сотрудник?",

                            value:
                                formData.fromDepartment,

                            inline:
                                true
                        },

                        {
                            name:
                                "Куда переводится сотрудник?",

                            value:
                                formData.toDepartment,

                            inline:
                                true
                        },

                        {
                            name:
                                "Имя Фамилия | Статик",

                            value:
                                formData.employeeName.slice(
                                    0,
                                    1024
                                ),

                            inline:
                                false
                        },

                        {
                            name:
                                "Оформил перевод",

                            value:
                                `<@${discordUser.id}>`,

                            inline:
                                true
                        },

                        {
                            name:
                                "Discord ID",

                            value:
                                String(
                                    discordUser.id
                                ),

                            inline:
                                true
                        }
                    ],

                    footer: {
                        text:
                            "EMS Adam Forms"
                    }
                }
            ]
        };

        /*
         * Добавляем аватар Webhook,
         * только если ссылка указана.
         */
        if (webhookAvatarUrl) {
            webhookPayload.avatar_url =
                webhookAvatarUrl;
        }

        /*
         * Информация для проверки перед отправкой.
         *
         * Сам URL Webhook в консоль не выводится.
         */
        console.log(
            "Отправка служебного перевода:",
            {
                employeeName:
                    formData.employeeName,

                fromDepartment:
                    formData.fromDepartment,

                toDepartment:
                    formData.toDepartment,

                roleIds,

                roleMentions,

                hasWebhook:
                    Boolean(webhookUrl)
            }
        );

        /*
         * Отправка перевода в Discord.
         */
        try {
            await axios.post(
                webhookUrl,
                webhookPayload,
                {
                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    timeout:
                        15000
                }
            );

            console.log(
                "Служебный перевод успешно отправлен:",
                {
                    employeeName:
                        formData.employeeName,

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
                        `Перевод сотрудника ${formData.employeeName} из отдела ${formData.fromDepartment} в отдел ${formData.toDepartment} успешно оформлен.`,

                    formData: {}
                }
            );
        } catch (error) {
            console.error(
                "Ошибка отправки служебного перевода:",
                {
                    message:
                        error.message,

                    status:
                        error.response?.status,

                    data:
                        error.response?.data,

                    employeeName:
                        formData.employeeName,

                    fromDepartment:
                        formData.fromDepartment,

                    toDepartment:
                        formData.toDepartment,

                    roleIds
                }
            );

            return res.status(500).render(
                "staff-department-transfer",
                {
                    user:
                        req.session.user,

                    success:
                        false,

                    error:
                        "Не удалось отправить перевод в Discord. Попробуйте ещё раз позднее.",

                    formData
                }
            );
        }
    }
);

module.exports = router;