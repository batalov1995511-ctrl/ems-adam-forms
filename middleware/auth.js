function requireAuth(req,res,next){if(!req.session||!req.session.user)return res.redirect("/auth/discord");next();}
function requireControl(req,res,next){const u=req.session&&req.session.coreUser;if(!u||!["chief","tech_admin"].includes(u.access_level))return res.status(403).send("EMS Core: access denied");next();}
module.exports={requireAuth,requireControl};
