const express=require("express");
const {requireAuth}=require("../middleware/auth");
const {getUserById,getDepartments,completeInitialProfile}=require("../models/users");
const router=express.Router();

router.get("/profile",requireAuth,async(req,res,next)=>{
  try{
    const coreUser=await getUserById(req.session.coreUser.id);
    req.session.coreUser=coreUser;
    res.render("profile",{user:req.session.user,coreUser,permissions:req.session.permissions||[]});
  }catch(e){next(e);}
});

router.get("/profile/setup",requireAuth,async(req,res,next)=>{
  try{
    const coreUser=await getUserById(req.session.coreUser.id);
    if(coreUser.onboarding_completed_at)return res.redirect("/profile");
    res.render("profile-setup",{user:req.session.user,coreUser,departments:await getDepartments(),error:null});
  }catch(e){next(e);}
});

router.post("/profile/setup",requireAuth,async(req,res,next)=>{
  try{
    const coreUser=await completeInitialProfile(req.session.coreUser.id,req.body||{});
    req.session.coreUser=coreUser;
    res.redirect("/profile");
  }catch(e){
    if(e.status&&e.status<500){
      return res.status(e.status).render("profile-setup",{user:req.session.user,coreUser:req.session.coreUser,departments:await getDepartments(),error:e.message});
    }
    next(e);
  }
});

module.exports=router;
