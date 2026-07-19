const express = require("express");
const axios = require("axios");

const router = express.Router();
console.log("promotion.js подключён");
/**
 * Полный список рангов EMS.
 *
 * С текущего ранга можно выбрать только 1–13,
 * потому что 14-й ранг является максимальным.
 */
const promotionRanks = [
    { value: 1, name: "Стажер" },
    { value: 2, name: "Интерн" },
    { value: 3, name: "Фельдшер" },
    { value: 4, name: "Старший фельдшер" },
    { value: 5, name: "Реаниматолог" },
    { value: 6, name: "Терапевт" },
    { value: 7, name: "Психиатр" },
    { value: 8, name: "Анестезиолог" },
    { value: 9, name: "Невролог" },
    { value: 10, name: "Врач высшей категории" },
    { value: 11, name: "Инструктор" },
    { value: 12, name: "Заместитель заведующего" },
    { value: 13, name: "Заведующий отделением" },
    { value: 14, name: "Заместитель главного врача" }
];

/**
 * Удаляет лишние пробелы и безопасно превращает
 * полученное значение в строку.
 */
function cleanText(value) {
    return String(value || "").trim();
}

/**
 * Проверка авторизации через Discord.
 *
 * Предполагается, что после OAuth пользователь
 * хранится в req.session.user.
 */
function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect("/auth/discord");
    }

    next();
}

/**
 * Возвращает информацию о ранге по его номеру.
 */
function getRank(rankNumber) {
    return promotionRanks.find(
        (rank) => rank.value === Number(rankNumber)
    );
}

/**
 * Формирует красивое название ранга.
 *
 * Например:
 * 4 — Старший фельдшер
 */
function getRankLabel(rankNumber) {
    const rank = getRank(rankNumber);

    if (!rank) {
        return "Неизвестный ранг";
    }

    return `${rank.value} — ${rank.name}`;
}

/**
 * Возвращает имя авторизованного Discord-пользователя.
 */
function getDiscordUsername(user) {
    if (!user) {
        return "Неизвестный пользователь";
    }

    return (
        cleanText(user.global_name) ||
        cleanText(user.displayName) ||
        cleanText(user.username) ||
        "Неизвестный пользователь"
    );
}

/**
 * Безопасное отображение страницы с ошибкой.
 */
function renderPromotionPage(
    res,
    {
        status = 200,
        error = null,
        success = null,
        formData = {}
    } = {}
) {
    return res.status(status).render("promotion", {
        ranks: promotionRanks,
        error,
        success,
        formData
    });
}

/**
 * GET /forms/promotion
 *
 * Показывает форму повышения.
 */
router.get("/promotion", requireAuth, (req, res) => {
    return renderPromotionPage(res);
});

/**
 * POST /forms/promotion
 *
 * Проверяет данные и отправляет заявку в Discord.
 */
router.post("/promotion", requireAuth, async (req, res) => {
    const fullName = cleanText(req.body.fullName);
    const currentRank = Number(req.body.currentRank);
    const requestedRank = Number(req.body.requestedRank);
    const approvedReport = cleanText(req.body.approvedReport);
    const activeReprimand = cleanText(req.body.activeReprimand);

    const formData = {
        fullName,
        currentRank: cleanText(req.body.currentRank),
        requestedRank: cleanText(req.body.requestedRank),
        approvedReport,
        activeReprimand
    };

    /*
     * Проверяем обязательные поля.
     */
    if (
        !fullName ||
        !currentRank ||
        !requestedRank ||
        !approvedReport ||
        !activeReprimand
    ) {
        return renderPromotionPage(res, {
            status: 400,
            error: "Заполните все обязательные поля.",
            formData
        });
    }

    /*
     * Проверяем длину ФИО и статика.
     */
    if (fullName.length < 3 || fullName.length > 150) {
        return renderPromotionPage(res, {
            status: 400,
            error:
                "Поле «Фамилия Имя | Статик» должно содержать от 3 до 150 символов.",
            formData
        });
    }

    /*
     * С текущего ранга доступны только ранги 1–13.
     */
    if (
        !Number.isInteger(currentRank) ||
        currentRank < 1 ||
        currentRank > 13
    ) {
        return renderPromotionPage(res, {
            status: 400,
            error: "Выбран некорректный текущий ранг.",
            formData
        });
    }

    /*
     * Запрашиваемый ранг может быть только от 2 до 14.
     */
    if (
        !Number.isInteger(requestedRank) ||
        requestedRank < 2 ||
        requestedRank > 14
    ) {
        return renderPromotionPage(res, {
            status: 400,
            error: "Выбран некорректный запрашиваемый ранг.",
            formData
        });
    }

    /*
     * Главное правило:
     * повышение возможно только на следующий ранг.
     *
     * Например:
     * 3 → 4 разрешено
     * 3 → 5 запрещено
     */
    if (requestedRank !== currentRank + 1) {
        return renderPromotionPage(res, {
            status: 400,
            error: "Повышение возможно только на следующий ранг.",
            formData
        });
    }

    /*
     * Допустимые варианты наличия выговора.
     */
    const allowedReprimandValues = ["Нет", "Да"];

    if (!allowedReprimandValues.includes(activeReprimand)) {
        return renderPromotionPage(res, {
            status: 400,
            error: "Выберите корректный вариант наличия активного выговора.",
            formData
        });
    }

    /*
     * Ограничение длины ссылки или описания отчёта,
     * чтобы не превысить лимиты Discord Embed.
     */
    if (approvedReport.length > 1000) {
        return renderPromotionPage(res, {
            status: 400,
            error:
                "Ссылка или информация об отчёте не должна превышать 1000 символов.",
            formData
        });
    }

    const webhookUrl = cleanText(
        process.env.PROMOTION_WEBHOOK_URL
    );

    const promotionRoleId = cleanText(
        process.env.PROMOTION_ROLE_ID
    );

    if (!webhookUrl) {
        console.error(
            "Не задана переменная PROMOTION_WEBHOOK_URL."
        );

        return renderPromotionPage(res, {
            status: 500,
            error:
                "Webhook формы повышения не настроен. Обратитесь к администратору.",
            formData
        });
    }

    /*
     * Discord Role ID должен состоять только из цифр.
     */
    if (!/^\d+$/.test(promotionRoleId)) {
        console.error(
            "Переменная PROMOTION_ROLE_ID отсутствует или содержит некорректный Discord Role ID."
        );

        return renderPromotionPage(res, {
            status: 500,
            error:
                "Роль для уведомлений не настроена. Обратитесь к администратору.",
            formData
        });
    }

    const discordUser = req.session.user;
    const discordUserId = cleanText(discordUser.id);
    const discordUsername = getDiscordUsername(discordUser);

    /*
     * Упоминаем только одну роль.
     */
    const roleMention = `<@&${promotionRoleId}>`;

    const webhookAvatarUrl = cleanText(
        process.env.HR_WEBHOOK_AVATAR_URL
    );

    const payload = {
        username: "EMS | Отдел кадров",

        ...(webhookAvatarUrl
            ? { avatar_url: webhookAvatarUrl }
            : {}),

        content: roleMention,

        /*
         * Явно разрешаем Discord упомянуть только заданную роль.
         * Никакие дополнительные роли или пользователи
         * упомянуты не будут.
         */
        allowed_mentions: {
            parse: [],
            roles: [promotionRoleId]
        },

        embeds: [
            {
                title: "📈 Запрос на повышение",

                description:
                    "Поступило новое заявление на рассмотрение повышения сотрудника.",

                color: 0x2ecc71,

                fields: [
                    {
                        name: "👤 Заявитель Discord",
                        value: discordUserId
                            ? `<@${discordUserId}>\n${discordUsername}`
                            : discordUsername,
                        inline: false
                    },
                    {
                        name: "🪪 Фамилия Имя | Статик",
                        value: fullName,
                        inline: false
                    },
                    {
                        name: "📉 Текущий ранг",
                        value: getRankLabel(currentRank),
                        inline: true
                    },
                    {
                        name: "📈 Запрашиваемый ранг",
                        value: getRankLabel(requestedRank),
                        inline: true
                    },
                    {
                        name: "📋 Одобренный отчёт",
                        value: approvedReport,
                        inline: false
                    },
                    {
                        name: "⚠️ Активный выговор",
                        value: activeReprimand,
                        inline: true
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

        return renderPromotionPage(res, {
            success:
                "Запрос на повышение успешно отправлен на рассмотрение.",
            formData: {}
        });
    } catch (error) {
        console.error(
            "Ошибка отправки формы повышения в Discord:",
            error.response?.data || error.message
        );

        return renderPromotionPage(res, {
            status: 500,
            error:
                "Не удалось отправить запрос. Попробуйте ещё раз позднее.",
            formData
        });
    }
});

module.exports = router;