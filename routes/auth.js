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
| Вход через Discord
|--------------------------------------------------------------------------
*/

router.get("/discord", (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;

    if (!clientId || !redirectUri) {
        console.error("Не заполнены DISCORD_CLIENT_ID или DISCORD_REDIRECT_URI");

        return res
            .status(500)
            .send("Ошибка настройки Discord OAuth. Проверьте файл .env.");
    }

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "identify"
    });

    const authorizationUrl =
        `https://discord.com/oauth2/authorize?${params.toString()}`;

    res.redirect(authorizationUrl);
});

/*
|--------------------------------------------------------------------------
| Callback Discord
|--------------------------------------------------------------------------
*/

router.get("/callback", async (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res
            .status(400)
            .send("Discord не передал код авторизации.");
    }

    try {
        const tokenResponse = await axios.post(
            "https://discord.com/api/oauth2/token",
            new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: "authorization_code",
                code: code,
                redirect_uri: process.env.DISCORD_REDIRECT_URI
            }).toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        const userResponse = await axios.get(
            "https://discord.com/api/users/@me",
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );

        req.session.user = userResponse.data;

        console.log(
            `Пользователь авторизован: ${userResponse.data.username} (${userResponse.data.id})`
        );

        res.redirect("/dashboard");
    } catch (error) {
        console.error(
            "Ошибка Discord OAuth:",
            error.response?.data || error.message
        );

        res
            .status(500)
            .send("Не удалось выполнить вход через Discord.");
    }
});

/*
|--------------------------------------------------------------------------
| Выход из аккаунта
|--------------------------------------------------------------------------
*/

router.get("/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Ошибка завершения сессии:", error);
            return res.status(500).send("Не удалось выйти из аккаунта.");
        }

        res.clearCookie("connect.sid");
        res.redirect("/");
    });
});

/*
|--------------------------------------------------------------------------
| Страница заявления на увольнение
|--------------------------------------------------------------------------
|
| Итоговый адрес:
| http://localhost:3000/auth/resignation
|
*/

router.get("/resignation", requireAuth, (req, res) => {
    res.render("resignation", {
        user: req.session.user,
        success: false,
        error: null
    });
});

/*
|--------------------------------------------------------------------------
| Отправка заявления на увольнение
|--------------------------------------------------------------------------
*/

router.post("/resignation", requireAuth, async (req, res) => {
    const {
        characterInfo,
        rank,
        reason,
        activeReprimand
    } = req.body || {};

    /*
     * Проверяем обязательные поля.
     */
    if (!characterInfo || !reason || !activeReprimand) {
        return res.status(400).render("resignation", {
            user: req.session.user,
            success: false,
            error: "Заполните все обязательные поля."
        });
    }

    const webhookUrl = process.env.RESIGNATION_WEBHOOK_URL;
    const roleId = process.env.RESIGNATION_ROLE_ID;

    if (!webhookUrl) {
        console.error("В .env отсутствует RESIGNATION_WEBHOOK_URL");

        return res.status(500).render("resignation", {
            user: req.session.user,
            success: false,
            error: "Webhook для заявлений не настроен."
        });
    }

    if (!roleId) {
        console.error("В .env отсутствует RESIGNATION_ROLE_ID");

        return res.status(500).render("resignation", {
            user: req.session.user,
            success: false,
            error: "ID роли для уведомления не настроен."
        });
    }

    try {
        console.log("ID роли:", roleId);
        console.log("Текст упоминания:", `<@&${roleId}>`);

        await axios.post(webhookUrl, {
            username: "EMS Adam Forms",

            /*
             * Упоминание роли должно находиться именно в content.
             */
            content: `<@&${roleId}>`,

            allowed_mentions: {
                roles: [roleId]
            },

            embeds: [
                {
                    title: "Заявление на увольнение",
                    color: 15548997,
                    timestamp: new Date().toISOString(),

                    author: {
                        name: req.session.user.global_name
                            || req.session.user.username
                            || "Пользователь Discord"
                    },

                    fields: [
                        {
                            name: "Discord",
                            value: `<@${req.session.user.id}>`,
                            inline: true
                        },
                        {
                            name: "Discord ID",
                            value: String(req.session.user.id),
                            inline: true
                        },
                        {
                            name: "Фамилия Имя | Статик",
                            value: String(characterInfo).slice(0, 1024),
                            inline: false
                        },
                        {
                            name: "Ранг при увольнении",
                            value: rank
                                ? String(rank).slice(0, 1024)
                                : "Не указан",
                            inline: true
                        },
                        {
                            name: "Активный выговор",
                            value: String(activeReprimand).slice(0, 1024),
                            inline: true
                        },
                        {
                            name: "Причина увольнения",
                            value: String(reason).slice(0, 1024),
                            inline: false
                        }
                    ],

                    footer: {
                        text: "EMS Adam Forms"
                    }
                }
            ]
        });

        console.log("Заявление успешно отправлено в Discord.");

        res.render("resignation", {
            user: req.session.user,
            success: true,
            error: null
        });
    } catch (error) {
        console.error(
            "Ошибка отправки webhook:",
            error.response?.data || error.message
        );

        res.status(500).render("resignation", {
            user: req.session.user,
            success: false,
            error: "Не удалось отправить заявление в Discord."
        });
    }
});

module.exports = router;