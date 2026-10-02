const express = require("express");

const {
  requireControl,
  requirePermission
} = require("../middleware/auth");

const {
  listEmployees,
  getEmployeeById
} = require("../models/users");

const router = express.Router();

router.get("/", requireControl, (req, res) => {
  res.render("control", {
    user: req.session.user,
    coreUser: req.session.coreUser
  });
});

router.get(
  "/employees",
  requirePermission("employees.view"),
  async (req, res, next) => {
    try {
      const employees = await listEmployees();

      res.render("control-employees", {
        user: req.session.user,
        coreUser: req.session.coreUser,
        employees
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/employees/:id",
  requirePermission("employees.view"),
  async (req, res, next) => {
    try {
      const employee = await getEmployeeById(req.params.id);

      if (!employee) {
        return res.status(404).render("error", {
          status: 404,
          title: "Сотрудник не найден",
          message: "Профиль сотрудника отсутствует в EMS Pulse."
        });
      }

      const canManage =
        (req.session.permissions || []).includes("employees.manage");

      res.render("control-employee", {
        user: req.session.user,
        coreUser: req.session.coreUser,
        employee,
        canManage
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
