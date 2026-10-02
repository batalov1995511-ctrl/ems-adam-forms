const express=require("express");
const {requireControl,requirePermission}=require("../middleware/auth");
const {listEmployees,getEmployeeById,getDepartments,updateEmployeePersonnel,listPersonnelEvents}=require("../models/users");
const router=express.Router();

router.get("/",requireControl,(req,res)=>res.render("control",{user:req.session.user,coreUser:req.session.coreUser}));

router.get("/employees",requirePermission("employees.view"),async(req,res,next)=>{
  try{res.render("control-employees",{user:req.session.user,coreUser:req.session.coreUser,employees:await listEmployees()});}catch(e){next(e);}
});

router.get("/employees/:id",requirePermission("employees.view"),async(req,res,next)=>{
  try{
    const employee=await getEmployeeById(req.params.id);
    if(!employee)return res.status(404).render("error",{status:404,title:"Сотрудник не найден",message:"Профиль сотрудника отсутствует в EMS Pulse."});
    const canManage=(req.session.permissions||[]).includes("employees.manage");
    res.render("control-employee",{user:req.session.user,coreUser:req.session.coreUser,employee,canManage,departments:canManage?await getDepartments():[],events:await listPersonnelEvents(employee.id),saved:req.query.saved==="1",error:null});
  }catch(e){next(e);}
});

router.post("/employees/:id",requirePermission("employees.manage"),async(req,res,next)=>{
  try{
    await updateEmployeePersonnel(req.params.id,req.session.coreUser.id,req.body||{},req.ip);
    if(String(req.params.id)===String(req.session.coreUser.id))req.session.coreUser=await getEmployeeById(req.params.id);
    res.redirect("/control/employees/"+encodeURIComponent(req.params.id)+"?saved=1");
  }catch(e){
    if(e.status&&e.status<500){
      const employee=await getEmployeeById(req.params.id);
      if(!employee)return res.status(404).render("error",{status:404,title:"Сотрудник не найден",message:"Профиль сотрудника отсутствует в EMS Pulse."});
      return res.status(e.status).render("control-employee",{user:req.session.user,coreUser:req.session.coreUser,employee,canManage:true,departments:await getDepartments(),events:await listPersonnelEvents(employee.id),saved:false,error:e.message});
    }
    next(e);
  }
});

module.exports=router;
