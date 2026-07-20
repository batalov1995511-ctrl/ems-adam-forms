const express = require("express");
const axios = require("axios");

const router = express.Router();

function cleanText(value) {
    return String(value || "").trim();
}

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect("/auth/discord");
    }

    next();
}

function getDiscordUsername(user) {
    return (
        cleanText(user?.global_name) ||
        cleanText(user?.displayName) ||
        cleanText(user?.username) ||
        "Неизвестный пользователь"
    );
}

function renderBlacklistPage(
    res,
    {
        status = 200,
        error = null,
        success = null,
        formData = {},
        user
    } = {}
) {
    return res.status(status).render("blacklist", {
        error,
        success,
        formData,
        user
    });
}

/*
|--------------------------------------------------------------------------
| GET /forms/blacklist
|--------------------------------------------------------------------------
*/

router.get("/blacklist", requireAuth, (req, res) => {
    return renderBlacklistPage(res, {
        user: req.session.user
    });
});

/*
|--------------------------------------------------------------------------
| POST /forms/blacklist
|--------------------------------------------------------------------------
*/

router.post("/blacklist", requireAuth, async (req, res) => {
    /*
     * Discord ID всегда берём только из авторизованной сессии.
     * Значению из HTML-формы не доверяем.
     */
    const discordUser = req.session.user;
    const discordUserId = cleanText(discordUser?.id);
    const discordUsername = getDiscordUsername(discordUser);

    const applicantName = cleanText(req.body.applicantName);
    const targetName = cleanText(req.body.targetName);
    const reason = cleanText(req.body.reason);
    const evidence = cleanText(req.body.evidence);

    const formData = {
        applicantName,
        targetName,
        reason,
        evidence
    };

    /*
     * Проверяем Discord ID заявителя.
     */
    if (!/^\d+$/.test(discordUserId)) {
        return renderBlacklistPage(res, {
            status: 400,
            error:
                "Не удалось определить Discord ID. Выйдите из аккаунта и авторизуйтесь заново.",
            formData,
            user: discordUser
        });
    }

    /*
     * Все поля обязательны.
     */
    if (
        !applicantName ||
        !targetName ||
        !reason ||
        !evidence
    ) {
        return renderBlacklistPage(res, {
            status: 400,
            error: "Заполните все обязательные поля.",
            formData,
            user: discordUser
        });
    }

    /*
     * Проверяем поля с именем и статиком.
     */
    if (
        applicantName.length < 3 ||
        applicantName.length > 150
    ) {
        return renderBlacklistPage(res, {
            status: 400,
            error:
                "Поле с вашими данными должно содержать от 3 до 150 символов.",
            formData,
            user: discordUser
        });
    }

    if (
        targetName.length < 3 ||
        targetName.length > 150
    ) {
        return renderBlacklistPage(res, {
            status: 400,
            error:
                "Данные сотрудника для внесения в ЧС должны содержать от 3 до 150 символов.",
            formData,
            user: discordUser
        });
    }

    /*
     * Ограничения Discord Embed.
     */
    if (reason.length < 10 || reason.length > 1000) {
        return renderBlacklistPage(res, {
            status: 400,
            error:
                "Причина внесения в ЧС должна содержать от 10 до 1000 символов.",
            formData,
            user: discordUser
        });
    }

    if (evidence.length < 5 || evidence.length > 1000) {
        return renderBlacklistPage(res, {
            status: 400,
            error:
                "Поле со ссылками должно содержать от 5 до 1000 символов.",
            formData,
            user: discordUser
        });
    }

    const webhookUrl = cleanText(
        process.env.BLACKLIST_WEBHOOK_URL
    );

    const chiefDoctorRoleId = cleanText(
        process.env.CHIEF_DOCTOR_ROLE_ID
    );

    const deputyChiefDoctorRoleId = cleanText(
        process.env.DEPUTY_CHIEF_DOCTOR_ROLE_ID
    );

    if (!webhookUrl) {
        console.error(
            "Не задана переменная BLACKLIST_WEBHOOK_URL."
        );

        return renderBlacklistPage(res, {
            status: 500,
            error:
                "Webhook формы чёрного списка не настроен. Обратитесь к администратору.",
            formData,
            user: discordUser
        });
    }

    if (
        !/^\d+$/.test(chiefDoctorRoleId) ||
        !/^\d+$/.test(deputyChiefDoctorRoleId)
    ) {
        console.error(
            "Не настроены CHIEF_DOCTOR_ROLE_ID или DEPUTY_CHIEF_DOCTOR_ROLE_ID."
        );

        return renderBlacklistPage(res, {
            status: 500,
            error:
                "Роли для рассмотрения запросов не настроены. Обратитесь к администратору.",
            formData,
            user: discordUser
        });
    }

    if (chiefDoctorRoleId === deputyChiefDoctorRoleId) {
        console.error(
            "Главный врач и заместитель имеют одинаковый Discord Role ID."
        );

        return renderBlacklistPage(res, {
            status: 500,
            error:
                "Роли Главного врача и заместителя должны иметь разные Discord ID.",
            formData,
            user: discordUser
        });
    }

    const roleMentions = [
        `<@&${chiefDoctorRoleId}>`,
        `<@&${deputyChiefDoctorRoleId}>`
    ].join(" ");

    const webhookAvatarUrl = cleanText(
        process.env.HR_WEBHOOK_AVATAR_URL
    );

    const payload = {
        username: "EMS | Отдел кадров",

        ...(webhookAvatarUrl
            ? { avatar_url: webhookAvatarUrl }
            : {}),

        content: roleMentions,

        /*
         * Разрешаем упомянуть только две заданные роли.
         * Пользователь в Embed отображается, но уведомление ему
         * отправляться не будет.
         */
        allowed_mentions: {
            parse: [],
            roles: [
                chiefDoctorRoleId,
                deputyChiefDoctorRoleId
            ]
        },

        embeds: [
            {
                title: "⛔ Запрос на добавление в ЧС",

                description:
                    "Поступил новый запрос на внесение сотрудника в чёрный список EMS.",

                color: 0x9333ea,

                fields: [
                    {
                        name: "👤 Заявитель Discord",
                        value:
                            `<@${discordUserId}>\n` +
                            `${discordUsername}\n` +
                            `Discord ID: \`${discordUserId}\``,
                        inline: false
                    },
                    {
                        name: "🪪 Фамилия Имя | Статик (Ваши)",
                        value: applicantName,
                        inline: false
                    },
                    {
                        name:
                            "🚫 Фамилия Имя | Статик (Кого добавить в ЧС)",
                        value: targetName,
                        inline: false
                    },
                    {
                        name: "📄 Причина внесения в ЧС",
                        value: reason,
                        inline: false
                    },
                    {
                        name:
                            "🔗 Выговор(ы) | КА об увольнении",
                        value: evidence,
                        inline: false
                    }
                ],

                footer: {
                    text: "EMS | Отдел кадров"
                },

                timestamp: new Date().toISOString()
            }
        ]
    };

    try {
        await axios.post(webhookUrl, payload, {
            timeout: 10000,
            headers: {
                "Content-Type": "application/json"
            }
        });

        return renderBlacklistPage(res, {
            success:
                "Запрос на добавление в ЧС успешно отправлен на рассмотрение.",
            formData: {},
            user: discordUser
        });
    } catch (error) {
        console.error(
            "Ошибка отправки запроса в ЧС:",
            error.response?.data || error.message
        );

        return renderBlacklistPage(res, {
            status: 500,
            error:
                "Не удалось отправить запрос. Попробуйте ещё раз позднее.",
            formData,
            user: discordUser
        });
    }
});

module.exports = router;