import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncRoute, text, uuid } from "../lib/http.js";

const router=express.Router();
router.use(requireAuth);
router.get("/wellness-profile",asyncRoute(async(req,res)=>{const r=await pool.query("SELECT * FROM user_wellness_profiles WHERE user_id=$1",[req.user.id]);res.json({wellnessProfile:r.rows[0]||null});}));
router.put("/wellness-profile",asyncRoute(async(req,res)=>{
  const currentSymptoms=text(req.body.currentSymptoms,"Current symptoms",{required:true,max:4000});
  const symptomsDuration=text(req.body.symptomsDuration,"Symptoms duration",{required:true,max:250});
  const symptomsFrequency=text(req.body.symptomsFrequency,"Symptoms frequency",{required:true,max:250});
  if(!req.body.consentGiven)return res.status(400).json({message:"Privacy and terms consent is required."});
  const r=await pool.query(`INSERT INTO user_wellness_profiles(
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
    consent_given=true,updated_at=now() RETURNING *`,[
      req.user.id,currentSymptoms,symptomsDuration,symptomsFrequency,Boolean(req.body.takesMedication),
      text(req.body.medicationDetails,"Medication details",{max:4000}),
      text(req.body.ongoingConditions,"Ongoing conditions",{max:4000}),
      text(req.body.familyMedicalHistory,"Family medical history",{max:4000}),
      text(req.body.treatmentsTried,"Treatments tried",{max:4000}),
      text(req.body.chronicDiseases,"Chronic diseases",{max:4000}),
      text(req.body.wellnessGoals,"Wellness goals",{max:4000}),
    ]);
  res.json({wellnessProfile:r.rows[0]});
}));
router.get("/addresses",asyncRoute(async(req,res)=>{const r=await pool.query("SELECT * FROM user_addresses WHERE user_id=$1 ORDER BY is_default DESC,created_at",[req.user.id]);res.json({addresses:r.rows});}));
router.post("/addresses",asyncRoute(async(req,res)=>{const client=await pool.connect();try{await client.query("BEGIN");if(req.body.isDefault)await client.query("UPDATE user_addresses SET is_default=false WHERE user_id=$1",[req.user.id]);const r=await client.query(`INSERT INTO user_addresses(user_id,type,full_name,phone,street,city,postal_code,country,is_default,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) RETURNING *`,[req.user.id,req.body.type||"SHIPPING",text(req.body.fullName,"Full name",{required:true,max:200}),text(req.body.phone,"Phone",{max:40}),text(req.body.street,"Street",{required:true,max:250}),text(req.body.city,"City",{required:true,max:120}),text(req.body.postalCode,"Postal code",{required:true,max:30}),text(req.body.country,"Country",{required:true,max:100}),Boolean(req.body.isDefault)]);await client.query("COMMIT");res.status(201).json({address:r.rows[0]});}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}));
router.delete("/addresses/:id",asyncRoute(async(req,res)=>{await pool.query("DELETE FROM user_addresses WHERE id=$1 AND user_id=$2",[uuid(req.params.id),req.user.id]);res.status(204).end();}));
router.get("/favorites",asyncRoute(async(req,res)=>{const r=await pool.query(`SELECT f.id,f.created_at,p.id product_id,p.name,p.slug,p.price,p.currency,w.id workshop_id,w.title,w.slug workshop_slug,a.id article_id,a.title,a.slug article_slug FROM favorites f LEFT JOIN products p ON p.id=f.product_id LEFT JOIN workshops w ON w.id=f.workshop_id LEFT JOIN knowledge_articles a ON a.id=f.article_id WHERE f.user_id=$1 ORDER BY f.created_at DESC`,[req.user.id]);res.json({favorites:r.rows});}));
router.post("/favorites",asyncRoute(async(req,res)=>{const values=[req.body.productId||null,req.body.workshopId||null,req.body.articleId||null];if(values.filter(Boolean).length!==1)return res.status(400).json({message:"Choose exactly one item to favorite."});const r=await pool.query(`INSERT INTO favorites(user_id,product_id,workshop_id,article_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`,[req.user.id,...values]);res.status(201).json({favorite:r.rows[0]||null});}));
router.delete("/favorites/:id",asyncRoute(async(req,res)=>{await pool.query("DELETE FROM favorites WHERE id=$1 AND user_id=$2",[uuid(req.params.id),req.user.id]);res.status(204).end();}));
router.get("/bookings",asyncRoute(async(req,res)=>{const r=await pool.query(`SELECT b.*,s.starts_at,s.ends_at,s.location,w.title FROM workshop_bookings b JOIN workshop_sessions s ON s.id=b.session_id JOIN workshops w ON w.id=s.workshop_id WHERE b.user_id=$1 ORDER BY s.starts_at DESC`,[req.user.id]);res.json({bookings:r.rows});}));
export default router;
