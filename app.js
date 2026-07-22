require("dotenv").config();

const express = require("express");
const session = require("express-session");
const path = require("path");

const authRoutes = require("./routes/auth");
const formRoutes = require("./routes/forms");
const promotionRoutes = require("./routes/promotion");
const blacklistRoutes = require("./routes/blacklist");
const breakRoutes = require("./routes/break");
const departmentTransferRoutes = require("./routes/department-transfer");
const staffDepartmentTransferRoutes = require("./routes/staff-department-transfer");
const app = express();
const PORT = process.env.PORT || 3000;

/*
|--------------------------------------------------------------------------
| Настройка EJS
|--------------------------------------------------------------------------
*/

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/*
|--------------------------------------------------------------------------
| Статические файлы
|--------------------------------------------------------------------------
|
| CSS, изображения и другие файлы должны находиться в папке public.
|
*/

app.use(express.static(path.join(__dirname, "public")));

/*
|--------------------------------------------------------------------------
| Чтение данных из форм
|--------------------------------------------------------------------------
*/

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/*
|--------------------------------------------------------------------------
| Сессии
|--------------------------------------------------------------------------
*/

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "ems-adam-forms-temporary-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

/*
|--------------------------------------------------------------------------
| Маршруты авторизации
|--------------------------------------------------------------------------
|
| routes/auth.js:
| router.get("/discord", ...)
|
| Итоговый адрес:
| /auth/discord
|
*/

app.use("/auth", authRoutes);
app.use("/forms", formRoutes);
app.use("/forms", promotionRoutes);
app.use("/forms", blacklistRoutes);
app.use("/forms", breakRoutes);
app.use( "/forms", departmentTransferRoutes);
app.use("/forms", staffDepartmentTransferRoutes);
/*
|--------------------------------------------------------------------------
| Главная страница
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
    if (req.session.user) {
        return res.redirect("/dashboard");
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EMS Adam Forms</title>
        </head>
        <body>
            <h1>EMS Adam Forms</h1>
            <p>Для продолжения войдите через Discord.</p>

            <a href="/auth/discord">
                Авторизоваться через Discord
            </a>
        </body>
        </html>
    `);
});

/*
|--------------------------------------------------------------------------
| Панель управления
|--------------------------------------------------------------------------
*/

app.get("/dashboard", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/auth/discord");
    }

    res.render("dashboard", {
        user: req.session.user
    });
});

/*
|--------------------------------------------------------------------------
| Старый адрес формы увольнения
|--------------------------------------------------------------------------
|
| Этот маршрут перенаправляет на маршрут из routes/auth.js.
|
*/

app.get("/resignation", (req, res) => {
    res.redirect("/auth/resignation");
});

/*
|--------------------------------------------------------------------------
| Проверка работы сервера
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
    res.json({
        status: "ok"
    });
});

/*
|--------------------------------------------------------------------------
| Страница не найдена
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
    res.status(404).send(`
        <h1>404</h1>
        <p>Страница не найдена.</p>
        <p>Запрошенный адрес: ${req.originalUrl}</p>
        <a href="/">Вернуться на главную</a>
    `);
});

/*
|--------------------------------------------------------------------------
| Обработка ошибок
|--------------------------------------------------------------------------
*/

app.use((error, req, res, next) => {
    console.error("Ошибка сервера:", error);

    res.status(500).send(`
        <h1>Ошибка сервера</h1>
        <p>Посмотрите подробности в терминале.</p>
        <a href="/">Вернуться на главную</a>
    `);
});

/*
|--------------------------------------------------------------------------
| Запуск сервера
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
    console.log(
        `Discord авторизация: http://localhost:${PORT}/auth/discord`
    );
});