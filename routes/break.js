const express = require("express");
const axios = require("axios");

const router = express.Router();

const ALLOWED_DEPARTMENTS = [
    "IN",
    "SD",
    "EMT",
    "PSED",
    "HAD",
    "PM",
    "DI"
];

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect("/auth/discord");
    }

    next();
}

function cleanText(value, maxLength = 1000) {
    return String(value || "")
        .trim()
        .slice(0, maxLength);
}

function renderBreakForm(req, res, options = {}) {
    return res.render("break", {
        user: req.session.user,
        error: options.error || null,
        success: options.success || null,
        formData: options.formData || {}
    });
}

function getDepartmentRoleIds(department) {
    const departmentRoles = {
        SD: [
            process.env.SD_BREAK_HEAD_ROLE_ID,
            process.env.SD_BREAK_DEPUTY_ROLE_ID
        ],

        EMT: [
            process.env.EMT_BREAK_HEAD_ROLE_ID,
            process.env.EMT_BREAK_DEPUTY_ROLE_ID
        ],

        PSED: [
            process.env.PSED_BREAK_HEAD_ROLE_ID,
            process.env.PSED_BREAK_DEPUTY_ROLE_ID
        ],

        HAD: [
            process.env.HAD_BREAK_HEAD_ROLE_ID,
            process.env.HAD_BREAK_DEPUTY_ROLE_ID
        ],

        PM: [
            process.env.PM_BREAK_HEAD_ROLE_ID,
            process.env.PM_BREAK_DEPUTY_ROLE_ID
        ],

        DI: [
            process.env.DI_BREAK_HEAD_ROLE_ID,
            process.env.DI_BREAK_DEPUTY_ROLE_ID
        ],

        /*
         * Сотрудники отдела IN относятся к руководству DI.
         */
        IN: [
            process.env.DI_BREAK_HEAD_ROLE_ID,
            process.env.DI_BREAK_DEPUTY_ROLE_ID
        ]
    };

    return departmentRoles[department] || [];
}

function getMentionRoleIds(rank, department) {
    /*
     * Ранги 11–13:
     * главный врач и заместитель главного врача.
     */
    if (rank >= 11 && rank <= 13) {
        return [
            process.env.CHIEF_DOCTOR_ROLE_ID,
            process.env.DEPUTY_CHIEF_DOCTOR_ROLE_ID
        ].filter(Boolean);
    }

    /*
     * Ранги 1–10:
     * руководство выбранного отдела.
     *
     * Для рангов 1–2 сервер автоматически
     * устанавливает отдел IN, который использует роли DI.
     */
    return getDepartmentRoleIds(department).filter(Boolean);
}

function createMentionContent(roleIds) {
    return [...new Set(roleIds)]
        .map((roleId) => `<@&${roleId}>`)
        .join(" ");
}

function validateTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

router.get("/break", requireAuth, (req, res) => {
    return renderBreakForm(req, res);
});

router.post("/break", requireAuth, async (req, res) => {
    const applicantDiscordId = String(req.session.user.id);

    const rank = Number(req.body.rank);

    let department = cleanText(
        req.body.department,
        10
    ).toUpperCase();

    const employeeName = cleanText(
        req.body.employeeName,
        120
    );

    const breakNumber = Number(req.body.breakNumber);

    const startTime = cleanText(
        req.body.startTime,
        5
    );

    const endTime = cleanText(
        req.body.endTime,
        5
    );

    const formData = {
        rank: req.body.rank || "",
        department,
        employeeName,
        breakNumber: req.body.breakNumber || "",
        startTime,
        endTime
    };

    /*
     * Проверка ранга.
     */
    if (
        !Number.isInteger(rank) ||
        rank < 1 ||
        rank > 13
    ) {
        return renderBreakForm(req, res, {
            error: "Выберите корректный ранг от 1 до 13.",
            formData
        });
    }

    /*
     * Ранги 1–2 всегда относятся к отделу IN.
     *
     * Даже если пользователь вручную изменит HTML,
     * сервер принудительно установит IN.
     */
    if (rank >= 1 && rank <= 2) {
        department = "IN";
        formData.department = "IN";
    }

    /*
     * Для рангов 3–13 необходимо выбрать
     * обычный отдел. IN вручную выбрать нельзя.
     */
    if (
        rank >= 3 &&
        (
            !ALLOWED_DEPARTMENTS.includes(department) ||
            department === "IN"
        )
    ) {
        return renderBreakForm(req, res, {
            error: "Выберите корректный отдел.",
            formData
        });
    }

    /*
     * Дополнительная проверка отдела.
     */
    if (!ALLOWED_DEPARTMENTS.includes(department)) {
        return renderBreakForm(req, res, {
            error: "Указан неизвестный отдел.",
            formData
        });
    }

    /*
     * Проверка имени, фамилии и статика.
     */
    if (!employeeName) {
        return renderBreakForm(req, res, {
            error: "Укажите имя, фамилию и статик.",
            formData
        });
    }

    /*
     * Проверка номера перерыва.
     */
    if (
        !Number.isInteger(breakNumber) ||
        breakNumber < 1 ||
        breakNumber > 3
    ) {
        return renderBreakForm(req, res, {
            error: "Выберите номер перерыва от 1 до 3.",
            formData
        });
    }

    /*
     * Проверка времени.
     */
    if (
        !validateTime(startTime) ||
        !validateTime(endTime)
    ) {
        return renderBreakForm(req, res, {
            error: "Укажите корректное время начала и окончания перерыва.",
            formData
        });
    }

    /*
     * В рамках одного дня время окончания
     * должно быть позже времени начала.
     */
    if (startTime >= endTime) {
        return renderBreakForm(req, res, {
            error: "Время окончания должно быть позже времени начала.",
            formData
        });
    }

    /*
     * Проверка вебхука.
     */
    if (!process.env.BREAK_WEBHOOK_URL) {
        console.error(
            "BREAK_WEBHOOK_URL is not configured"
        );

        return renderBreakForm(req, res, {
            error: "Вебхук формы перерыва не настроен.",
            formData
        });
    }

    const roleIds = getMentionRoleIds(
        rank,
        department
    );

    if (roleIds.length === 0) {
        console.error(
            "No break roles configured:",
            {
                rank,
                department
            }
        );

        return renderBreakForm(req, res, {
            error:
                "Для выбранного ранга и отдела не настроены роли уведомлений.",
            formData
        });
    }

    const mentionContent = createMentionContent(
        roleIds
    );

    const applicantUsername =
        req.session.user.global_name ||
        req.session.user.username ||
        "Неизвестный пользователь";

    const payload = {
        username: "EMS | Отдел кадров",

        avatar_url:
            process.env.HR_WEBHOOK_AVATAR_URL ||
            undefined,

        content: mentionContent,

        allowed_mentions: {
            parse: [],
            roles: [...new Set(roleIds)]
        },

        embeds: [
            {
                title: "☕ Заявление на перерыв",

                color: 0xf59e0b,

                fields: [
                    {
                        name: "Discord заявителя",
                        value: `<@${applicantDiscordId}>`,
                        inline: true
                    },
                    {
                        name: "Discord ID",
                        value: applicantDiscordId,
                        inline: true
                    },
                    {
                        name: "Discord имя",
                        value: applicantUsername,
                        inline: false
                    },
                    {
                        name: "Ваш отдел",
                        value: department,
                        inline: true
                    },
                    {
                        name: "Ваш ранг",
                        value: String(rank),
                        inline: true
                    },
                    {
                        name: "Имя Фамилия | Статик",
                        value: employeeName,
                        inline: false
                    },
                    {
                        name:
                            "Какой по счёту это перерыв за день",
                        value: String(breakNumber),
                        inline: false
                    },
                    {
                        name:
                            "Со скольки до скольки Вы хотите взять перерыв",
                        value: `${startTime}–${endTime}`,
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
        await axios.post(
            process.env.BREAK_WEBHOOK_URL,
            payload,
            {
                headers: {
                    "Content-Type": "application/json"
                },

                timeout: 10000
            }
        );

        return renderBreakForm(req, res, {
            success:
                "Заявление на перерыв успешно отправлено."
        });
    } catch (error) {
        console.error(
            "Break webhook error:",
            error.response?.data ||
            error.message
        );

        return renderBreakForm(req, res, {
            error:
                "Не удалось отправить заявление. Попробуйте позже.",
            formData
        });
    }
});

module.exports = router;