import express from "express";
import crypto from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncRoute, text, uuid } from "../lib/http.js";
import { sendWellnessSubmissionEmails } from "../services/email.js";

const router=express.Router();
router.use(requireAuth);
router.get("/wellness-profile",asyncRoute(async(req,res)=>{const r=await pool.query("SELECT * FROM user_wellness_profiles WHERE user_id=$1",[req.user.id]);res.json({wellnessProfile:r.rows[0]||null});}));
router.put("/wellness-profile",asyncRoute(async(req,res)=>{
  const currentSymptoms=text(req.body.currentSymptoms,"Current symptoms",{required:true,max:4000});
  const symptomsDuration=text(req.body.symptomsDuration,"Symptoms duration",{required:true,max:250});
  const symptomsFrequency=text(req.body.symptomsFrequency,"Symptoms frequency",{required:true,max:250});
  if(!req.body.consentGiven)return res.status(400).json({message:"Privacy and terms consent is required."});
  const values=[
    req.user.id,currentSymptoms,symptomsDuration,symptomsFrequency,Boolean(req.body.takesMedication),
    text(req.body.medicationDetails,"Medication details",{max:4000}),
    text(req.body.ongoingConditions,"Ongoing conditions",{max:4000}),
    text(req.body.familyMedicalHistory,"Family medical history",{max:4000}),
    text(req.body.treatmentsTried,"Treatments tried",{max:4000}),
    text(req.body.chronicDiseases,"Chronic diseases",{max:4000}),
    text(req.body.wellnessGoals,"Wellness goals",{max:4000}),
  ];
  const client=await pool.connect();
  let profile;
  let reviewCase;
  let user;
  try{
    await client.query("BEGIN");
    const profileResult=await client.query(`INSERT INTO user_wellness_profiles(
      user_id,current_symptoms,symptoms_duration,symptoms_frequency,takes_medication,
      medication_details,ongoing_conditions,family_medical_history,treatments_tried,
      chronic_diseases,wellness_goals,consent_given,updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,now())
    ON CONFLICT(user_id) DO UPDATE SET
      current_symptoms=EXCLUDED.current_symptoms,symptoms_duration=EXCLUDED.symptoms_duration,
      symptoms_frequency=EXCLUDED.symptoms_frequency,takes_medication=EXCLUDED.takes_medication,
      medication_details=EXCLUDED.medication_details,ongoing_conditions=EXCLUDED.ongoing_conditions,
      family_medical_history=EXCLUDED.family_medical_history,treatments_tried=EXCLUDED.treatments_tried,
      chronic_diseases=EXCLUDED.chronic_diseases,wellness_goals=EXCLUDED.wellness_goals,
      consent_given=true,updated_at=now() RETURNING *`,values);
    profile=profileResult.rows[0];
    const reference=`WP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const caseResult=await client.query(`INSERT INTO wellness_review_cases(reference,user_id,wellness_profile_id,profile_snapshot)
      VALUES($1,$2,$3,$4::jsonb) RETURNING *`,[reference,req.user.id,profile.id,JSON.stringify(profile)]);
    reviewCase=caseResult.rows[0];
    await client.query(`INSERT INTO wellness_review_history(case_id,status,message,changed_by,visible_to_customer)
      VALUES($1,'SUBMITTED',$2,$3,true)`,[reviewCase.id,"Your wellness profile has been received and sent for review.",req.user.id]);
    const userResult=await client.query("SELECT id,email,first_name,family_name FROM users WHERE id=$1",[req.user.id]);
    user=userResult.rows[0];
    await client.query("COMMIT");
  }catch(error){
    await client.query("ROLLBACK");
    throw error;
  }finally{
    client.release();
  }
  const emailDelivery=await sendWellnessSubmissionEmails({user,profile,reviewCase});
  res.json({wellnessProfile:profile,reviewCase,emailDelivery});
}));
router.get("/wellness-cases",asyncRoute(async(req,res)=>{
  const r=await pool.query(`SELECT c.*,
    COALESCE((SELECT json_agg(h ORDER BY h.created_at) FROM wellness_review_history h WHERE h.case_id=c.id AND h.visible_to_customer=true),'[]') history
    FROM wellness_review_cases c WHERE c.user_id=$1 ORDER BY c.created_at DESC`,[req.user.id]);
  res.json({cases:r.rows});
}));
router.get("/addresses",asyncRoute(async(req,res)=>{const r=await pool.query("SELECT * FROM user_addresses WHERE user_id=$1 ORDER BY is_default DESC,created_at",[req.user.id]);res.json({addresses:r.rows});}));
router.post("/addresses",asyncRoute(async(req,res)=>{const client=await pool.connect();try{await client.query("BEGIN");if(req.body.isDefault)await client.query("UPDATE user_addresses SET is_default=false WHERE user_id=$1",[req.user.id]);const r=await client.query(`INSERT INTO user_addresses(user_id,type,full_name,phone,street,city,postal_code,country,is_default,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) RETURNING *`,[req.user.id,req.body.type||"SHIPPING",text(req.body.fullName,"Full name",{required:true,max:200}),text(req.body.phone,"Phone",{max:40}),text(req.body.street,"Street",{required:true,max:250}),text(req.body.city,"City",{required:true,max:120}),text(req.body.postalCode,"Postal code",{required:true,max:30}),text(req.body.country,"Country",{required:true,max:100}),Boolean(req.body.isDefault)]);await client.query("COMMIT");res.status(201).json({address:r.rows[0]});}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}));
router.delete("/addresses/:id",asyncRoute(async(req,res)=>{await pool.query("DELETE FROM user_addresses WHERE id=$1 AND user_id=$2",[uuid(req.params.id),req.user.id]);res.status(204).end();}));
router.get("/favorites",asyncRoute(async(req,res)=>{const r=await pool.query(`SELECT f.id,f.created_at,p.id product_id,p.name,p.slug,p.price,p.currency,w.id workshop_id,w.title,w.slug workshop_slug,a.id article_id,a.title,a.slug article_slug FROM favorites f LEFT JOIN products p ON p.id=f.product_id LEFT JOIN workshops w ON w.id=f.workshop_id LEFT JOIN knowledge_articles a ON a.id=f.article_id WHERE f.user_id=$1 ORDER BY f.created_at DESC`,[req.user.id]);res.json({favorites:r.rows});}));
router.post("/favorites",asyncRoute(async(req,res)=>{const values=[req.body.productId||null,req.body.workshopId||null,req.body.articleId||null];if(values.filter(Boolean).length!==1)return res.status(400).json({message:"Choose exactly one item to favorite."});const r=await pool.query(`INSERT INTO favorites(user_id,product_id,workshop_id,article_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`,[req.user.id,...values]);res.status(201).json({favorite:r.rows[0]||null});}));
router.delete("/favorites/:id",asyncRoute(async(req,res)=>{await pool.query("DELETE FROM favorites WHERE id=$1 AND user_id=$2",[uuid(req.params.id),req.user.id]);res.status(204).end();}));
router.get("/bookings",asyncRoute(async(req,res)=>{const r=await pool.query(`SELECT b.*,s.starts_at,s.ends_at,s.location,w.title FROM workshop_bookings b JOIN workshop_sessions s ON s.id=b.session_id JOIN workshops w ON w.id=s.workshop_id WHERE b.user_id=$1 ORDER BY s.starts_at DESC`,[req.user.id]);res.json({bookings:r.rows});}));

function familyMemberValues(body) {
  const firstName=text(body.firstName,"First name",{required:true,max:120});
  const familyName=text(body.familyName,"Family name",{required:true,max:120});
  const relationship=text(body.relationship,"Relationship",{required:true,max:80});
  const dateOfBirth=String(body.dateOfBirth||"").trim();
  const parsed=new Date(`${dateOfBirth}T00:00:00Z`);
  if(!dateOfBirth||Number.isNaN(parsed.valueOf())||parsed>new Date()){const error=new Error("Enter a valid date of birth.");error.status=400;throw error;}
  const age=Math.floor((Date.now()-parsed.valueOf())/31557600000);
  if(age<18&&!body.guardianConfirmed){const error=new Error("Parent or guardian confirmation is required for family members under 18.");error.status=400;throw error;}
  return [firstName,familyName,relationship,dateOfBirth,text(body.wellnessNotes,"Wellness notes",{required:true,max:4000}),Boolean(body.guardianConfirmed)];
}

router.get("/family-members",asyncRoute(async(req,res)=>{
  const r=await pool.query("SELECT * FROM family_members WHERE user_id=$1 ORDER BY created_at",[req.user.id]);
  res.json({familyMembers:r.rows});
}));

router.post("/family-members",asyncRoute(async(req,res)=>{
  const values=familyMemberValues(req.body);
  const r=await pool.query(`INSERT INTO family_members(user_id,first_name,family_name,relationship,date_of_birth,wellness_notes,guardian_confirmed)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[req.user.id,...values]);
  res.status(201).json({familyMember:r.rows[0]});
}));

router.patch("/family-members/:id",asyncRoute(async(req,res)=>{
  const values=familyMemberValues(req.body);
  const r=await pool.query(`UPDATE family_members SET first_name=$1,family_name=$2,relationship=$3,date_of_birth=$4,wellness_notes=$5,guardian_confirmed=$6,updated_at=now()
    WHERE id=$7 AND user_id=$8 RETURNING *`,[...values,uuid(req.params.id),req.user.id]);
  if(!r.rows[0])return res.status(404).json({message:"Family member not found."});
  res.json({familyMember:r.rows[0]});
}));

router.delete("/family-members/:id",asyncRoute(async(req,res)=>{
  const r=await pool.query("DELETE FROM family_members WHERE id=$1 AND user_id=$2 RETURNING id",[uuid(req.params.id),req.user.id]);
  if(!r.rows[0])return res.status(404).json({message:"Family member not found."});
  res.status(204).end();
}));

function happyWishValues(body) {
  const title=text(body.title,"Wish title",{required:true,max:180});
  const wishType=String(body.wishType||"").trim().toUpperCase();
  if(!["DREAM","BIRTHDAY","WELLNESS","FAMILY","EXPERIENCE","OTHER"].includes(wishType)){const error=new Error("Choose a valid wish type.");error.status=400;throw error;}
  const description=text(body.description,"Wish description",{required:true,max:4000});
  const targetDate=String(body.targetDate||"").trim()||null;
  if(targetDate){const parsed=new Date(`${targetDate}T00:00:00Z`);if(Number.isNaN(parsed.valueOf())){const error=new Error("Enter a valid target date.");error.status=400;throw error;}}
  const importance=Number(body.importance);
  if(!Number.isInteger(importance)||importance<1||importance>5){const error=new Error("Choose an importance rating from 1 to 5.");error.status=400;throw error;}
  const firstStep=text(body.firstStep,"First step",{required:true,max:500});
  let score=25;
  score+=Math.min(20,Math.floor(description.length/12));
  score+=targetDate?15:0;
  score+=Math.min(20,firstStep.length>=35?20:Math.max(8,Math.floor(firstStep.length/2)));
  score+=importance*4;
  score=Math.min(100,score);
  const guidance=score>=85?"Your wish has strong clarity and a practical first step. Schedule that step and celebrate each milestone.":score>=65?"Your wish has positive momentum. Add a date to your first step and choose one person who can encourage you.":"Your wish is meaningful. Make the first step smaller and more specific so it feels easy to begin.";
  const recipientType=String(body.recipientType||body.recipient_type||"MYSELF").trim().toUpperCase();
  if(!["MYSELF","PARTNER","FRIEND","CHILD","PARENT","FAMILY","SOMEONE_SPECIAL"].includes(recipientType)){const error=new Error("Choose a valid wish recipient.");error.status=400;throw error;}
  const recipientName=recipientType==="MYSELF"?null:text(body.recipientName||body.recipient_name,"Recipient name",{required:true,max:160});
  return [title,wishType,description,targetDate,importance,firstStep,score,guidance,recipientType,recipientName];
}

router.get("/happy-wishes",asyncRoute(async(req,res)=>{
  const r=await pool.query("SELECT * FROM happy_wishes WHERE user_id=$1 ORDER BY created_at DESC",[req.user.id]);
  res.json({wishes:r.rows});
}));

router.post("/happy-wishes",asyncRoute(async(req,res)=>{
  const values=happyWishValues(req.body);
  const r=await pool.query(`INSERT INTO happy_wishes(user_id,title,wish_type,description,target_date,importance,first_step,momentum_score,guidance,recipient_type,recipient_name)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[req.user.id,...values]);
  res.status(201).json({wish:r.rows[0]});
}));

router.patch("/happy-wishes/:id",asyncRoute(async(req,res)=>{
  const values=happyWishValues(req.body);
  const status=String(req.body.status||"ACTIVE").trim().toUpperCase();
  if(!["ACTIVE","ACHIEVED","PAUSED"].includes(status))return res.status(400).json({message:"Choose a valid wish status."});
  const r=await pool.query(`UPDATE happy_wishes SET title=$1,wish_type=$2,description=$3,target_date=$4,importance=$5,first_step=$6,momentum_score=$7,guidance=$8,recipient_type=$9,recipient_name=$10,status=$11,updated_at=now()
    WHERE id=$12 AND user_id=$13 RETURNING *`,[...values,status,uuid(req.params.id),req.user.id]);
  if(!r.rows[0])return res.status(404).json({message:"Happy Wish not found."});
  res.json({wish:r.rows[0]});
}));

router.delete("/happy-wishes/:id",asyncRoute(async(req,res)=>{
  const r=await pool.query("DELETE FROM happy_wishes WHERE id=$1 AND user_id=$2 RETURNING id",[uuid(req.params.id),req.user.id]);
  if(!r.rows[0])return res.status(404).json({message:"Happy Wish not found."});
  res.status(204).end();
}));
export default router;
