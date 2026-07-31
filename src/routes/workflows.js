import express from "express";
import { pool } from "../db.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { asyncRoute, email, integer, text, uuid } from "../lib/http.js";
import { config } from "../config.js";

const router=express.Router();

const publicQuestionWindows=new Map();
function generalWellnessAnswer(question){
 const normalized=question.toLowerCase();
 if(/headache|migraine/.test(normalized))return "For a mild headache, some people find the aroma of lavender relaxing, while properly diluted peppermint oil applied to the temples or back of the neck may feel cooling. Never apply essential oils undiluted, keep them away from the eyes, and do not swallow them. Rest, drink water, eat regularly, and reduce bright light if it bothers you. Seek medical advice for frequent or worsening headaches, and urgent care for a sudden severe headache or one accompanied by weakness, confusion, fever, fainting, vision changes, or a head injury. This is general wellness information, not medical advice.";
 if(/sleep|insomnia|cannot sleep|can't sleep/.test(normalized))return "A consistent bedtime, a cool dark room, reduced evening screen time, and avoiding late caffeine may support better sleep. Some people find gently diffused lavender relaxing; follow the diffuser instructions and stop if it causes irritation or breathing discomfort. Persistent sleep problems should be discussed with a healthcare professional. This is general wellness information, not medical advice.";
 if(/stress|anxiety|relax/.test(normalized))return "Try slow breathing, a short walk, regular meals, adequate sleep, and a few quiet minutes away from screens. A gently diffused lavender or citrus aroma may feel calming for some people, but stop if it causes irritation or discomfort. If anxiety is persistent, severe, or affects daily life, contact a qualified healthcare professional. This is general wellness information, not medical advice.";
 return "For personalized and safe guidance, consider your symptoms, how long they have lasted, any medicines you use, allergies, pregnancy, and existing health conditions. Essential oils should be properly diluted, kept away from the eyes, and never swallowed unless specifically directed by a qualified healthcare professional. Persistent, worsening, or concerning symptoms should be assessed by a healthcare professional. This is general wellness information, not medical advice.";
}
router.post("/knowledge/ai-answer",asyncRoute(async(req,res)=>{
 const question=text(req.body.question,"Question",{required:true,max:1200});
 if(question.length<10)return res.status(400).json({message:"Please enter a question with at least 10 characters."});
 const now=Date.now();
 const key=req.ip||"anonymous";
 const recent=(publicQuestionWindows.get(key)||[]).filter((time)=>now-time<10*60*1000);
 if(recent.length>=10)return res.status(429).json({message:"Please wait before asking another question."});
 recent.push(now); publicQuestionWindows.set(key,recent);
 if(!config.openai.apiKey)return res.json({answer:generalWellnessAnswer(question)});
 const response=await fetch("https://api.openai.com/v1/responses",{
  method:"POST",
  headers:{Authorization:`Bearer ${config.openai.apiKey}`,"Content-Type":"application/json"},
  body:JSON.stringify({
   model:config.openai.model,store:false,max_output_tokens:500,
   instructions:"You are the Happy Drops wellness education assistant. Give clear, friendly, concise general wellness information. Never diagnose, prescribe, or claim to treat or cure disease. Do not recommend ingesting essential oils. Mention safe dilution and professional guidance when essential oils are relevant. If symptoms may be urgent or serious, advise contacting local emergency services or a qualified healthcare professional. Encourage medical review for persistent, worsening, pregnancy-related, medication-related, child-related, or chronic symptoms. Answer the actual question and finish with a brief note that this is general education, not medical advice.",
   input:question,
  }),
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok){console.error("Wellness answer service error",response.status,result?.error?.message||"");return res.json({answer:generalWellnessAnswer(question)});}
 const answer=result.output_text||result.output?.flatMap((item)=>item.content||[]).find((item)=>item.type==="output_text")?.text;
 if(!answer)return res.json({answer:generalWellnessAnswer(question)});
 res.json({answer});
}));

router.post("/assessments",optionalAuth,asyncRoute(async(req,res)=>{
  const answers=Array.isArray(req.body.answers)?req.body.answers:[];
  if(!answers.length) return res.status(400).json({message:"Assessment answers are required."});
  if(answers.some((answer)=>answer.answer===undefined||answer.answer===null)){
    return res.status(400).json({message:"Please answer every assessment question before submitting."});
  }
  const overallScore=Number(req.body.overallScore);
  if(!Number.isFinite(overallScore)||overallScore<1||overallScore>5){
    return res.status(400).json({message:"Assessment score is invalid."});
  }
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const submission=await client.query(`INSERT INTO assessment_submissions(user_id,consent_given,completed,overall_score,category_scores,recommendations,completed_at,updated_at)
      VALUES($1,$2,true,$3,$4::jsonb,$5::jsonb,now(),now()) RETURNING *`,[req.user?.id||null,Boolean(req.body.consentGiven),overallScore,JSON.stringify(req.body.categoryScores||{}),JSON.stringify(req.body.recommendations||[])]);
    for(const answer of answers) await client.query(`INSERT INTO assessment_answers(submission_id,question_key,category_key,answer,score) VALUES($1,$2,$3,$4,$5)`,
      [submission.rows[0].id,text(answer.questionKey,"Question key",{required:true,max:120}),text(answer.categoryKey,"Category key",{required:true,max:120}),JSON.stringify(answer.answer),answer.score??null]);
    await client.query("COMMIT");res.status(201).json({assessment:submission.rows[0]});
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}));
router.get("/assessments/me",requireAuth,asyncRoute(async(req,res)=>{const r=await pool.query("SELECT * FROM assessment_submissions WHERE user_id=$1 ORDER BY created_at DESC",[req.user.id]);res.json({assessments:r.rows});}));

router.post("/knowledge/questions",requireAuth,asyncRoute(async(req,res)=>{const r=await pool.query("INSERT INTO knowledge_questions(user_id,topic,question) VALUES($1,$2,$3) RETURNING *",[req.user.id,text(req.body.topic,"Topic",{required:true,max:160}),text(req.body.question,"Question",{required:true,max:4000})]);res.status(201).json({question:r.rows[0]});}));
router.get("/knowledge/questions",requireAuth,asyncRoute(async(req,res)=>{const r=await pool.query(`SELECT q.*,
 COALESCE((SELECT json_agg(a ORDER BY a.created_at) FROM knowledge_answers a WHERE a.question_id=q.id AND a.is_published),'[]') answers,
 (SELECT row_to_json(recipe) FROM (SELECT r.id,r.title,r.instructions,r.ingredients,r.safety_notes,r.price,r.currency,r.payment_status,r.preparation_status,r.pickup_location,r.pickup_date,r.pickup_time,r.paid_at,r.created_at FROM personalized_recipes r WHERE r.question_id=q.id ORDER BY r.created_at DESC LIMIT 1) recipe) recipe
 FROM knowledge_questions q WHERE q.user_id=$1 ORDER BY q.created_at DESC`,[req.user.id]);res.json({questions:r.rows});}));
router.get("/knowledge/recipes",requireAuth,asyncRoute(async(req,res)=>{const r=await pool.query("SELECT * FROM personalized_recipes WHERE user_id=$1 ORDER BY created_at DESC",[req.user.id]);res.json({recipes:r.rows});}));
router.patch("/knowledge/recipes/:id/pickup",requireAuth,asyncRoute(async(req,res)=>{
 const date=text(req.body.pickupDate,"Pickup date",{required:true,max:30});
 const time=text(req.body.pickupTime,"Pickup time",{required:true,max:30});
 const r=await pool.query(`UPDATE personalized_recipes SET pickup_date=$1::date,pickup_time=$2::time,updated_at=now()
  WHERE id=$3 AND user_id=$4 AND preparation_status IN('ready','collected') RETURNING *`,
  [date,time,uuid(req.params.id,"Recipe ID"),req.user.id]);
 if(!r.rows[0])return res.status(409).json({message:"This recipe is not ready for pickup."});
 res.json({recipe:r.rows[0]});
}));

router.get("/workshops",asyncRoute(async(_req,res)=>{const r=await pool.query(`SELECT w.*,COALESCE(json_agg(s ORDER BY s.starts_at) FILTER(WHERE s.id IS NOT NULL),'[]') sessions FROM workshops w LEFT JOIN workshop_sessions s ON s.workshop_id=w.id AND s.status='ACTIVE' WHERE w.status='ACTIVE' GROUP BY w.id ORDER BY w.title`);res.json({workshops:r.rows});}));
router.post("/workshops/requests",optionalAuth,asyncRoute(async(req,res)=>{const r=await pool.query(`INSERT INTO workshop_requests(workshop_id,user_id,full_name,email,phone,preferred_date,preferred_time,location,participant_count,purpose,special_requirements,updated_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) RETURNING *`,[req.body.workshopId||null,req.user?.id||null,text(req.body.fullName,"Full name",{required:true,max:200}),email(req.body.email),text(req.body.phone,"Phone",{max:40}),req.body.preferredDate||null,text(req.body.preferredTime,"Preferred time",{max:60}),text(req.body.location,"Location",{max:250}),integer(req.body.participantCount,"Participant count",{min:1,max:1000}),text(req.body.purpose,"Purpose",{max:4000}),text(req.body.specialRequirements,"Special requirements",{max:4000})]);res.status(201).json({request:r.rows[0]});}));
router.get("/workshops/requests/me",requireAuth,asyncRoute(async(req,res)=>{
 const r=await pool.query(`SELECT wr.*,w.title workshop_title,w.theme,w.default_price,
  (COALESCE(w.default_price,0)*COALESCE(wr.participant_count,0)) total_price,w.currency
  FROM workshop_requests wr LEFT JOIN workshops w ON w.id=wr.workshop_id
  WHERE wr.user_id=$1 ORDER BY wr.preferred_date DESC NULLS LAST,wr.created_at DESC`,[req.user.id]);
 res.json({requests:r.rows});
}));
router.post("/workshops/bookings",optionalAuth,asyncRoute(async(req,res)=>{
 const client=await pool.connect();try{await client.query("BEGIN");const session=await client.query(`SELECT s.*,w.currency,COALESCE(s.price_per_person,w.default_price) price,(SELECT COALESCE(sum(participant_count),0) FROM workshop_bookings WHERE session_id=s.id AND status NOT IN('CANCELLED','REFUNDED')) booked FROM workshop_sessions s JOIN workshops w ON w.id=s.workshop_id WHERE s.id=$1 AND s.status='ACTIVE' FOR UPDATE`,[uuid(req.body.sessionId,"Session ID")]);if(!session.rows[0]){await client.query("ROLLBACK");return res.status(404).json({message:"Workshop session not found."});}const count=integer(req.body.participantCount,"Participant count",{min:1,max:100,required:true});if(Number(session.rows[0].booked)+count>session.rows[0].capacity){await client.query("ROLLBACK");return res.status(409).json({message:"Not enough workshop spaces remain."});}const total=Number(session.rows[0].price)*count;const number=`WB-${Date.now().toString(36).toUpperCase()}`;const r=await client.query(`INSERT INTO workshop_bookings(booking_number,session_id,user_id,full_name,email,phone,participant_count,selected_theme,special_requests,total,currency,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) RETURNING *`,[number,session.rows[0].id,req.user?.id||null,text(req.body.fullName,"Full name",{required:true,max:200}),email(req.body.email),text(req.body.phone,"Phone",{max:40}),count,text(req.body.selectedTheme,"Theme",{max:200}),text(req.body.specialRequests,"Special requests",{max:4000}),total,session.rows[0].currency]);await client.query("COMMIT");res.status(201).json({booking:r.rows[0]});}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}));

router.post("/suppliers",asyncRoute(async(req,res)=>{
 if(!req.body.consentGiven)return res.status(400).json({message:"Consent is required."});
 const supplierType=text(req.body.supplierType,"Supplier type",{required:true,max:100});
 const documents=Array.isArray(req.body.documents)?req.body.documents:[];
 if(documents.length>2)return res.status(400).json({message:"A maximum of two documents is allowed."});
 if(supplierType==="space-partner"&&!documents.some(document=>document.type==="space-picture"))return res.status(400).json({message:"A picture of the space is required."});
 if(["nutrition-supplier","essential-oil-supplier"].includes(supplierType)&&!documents.some(document=>document.type==="quality-certificate"))return res.status(400).json({message:"A quality certificate is required."});
 for(const document of documents){
  const dataUrl=String(document.dataUrl||"");
  if(!/^data:(image\/(png|jpeg|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)){
   return res.status(400).json({message:"An uploaded supplier document has an unsupported format."});
  }
  if(dataUrl.length>4_300_000)return res.status(413).json({message:"Each uploaded document must be smaller than 3 MB."});
 }
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const r=await client.query(`INSERT INTO supplier_applications(company_name,contact_name,email,address,website,supplier_type,space_location,daily_customers,average_customer_spend,hourly_price,partnership_style,available_times,offering,consent_given,updated_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,now()) RETURNING id,status,created_at`,
   [text(req.body.companyName,"Company name",{required:true,max:200}),text(req.body.contactName,"Contact name",{required:true,max:200}),email(req.body.email),text(req.body.address,"Address",{required:true,max:2000}),text(req.body.website,"Website",{max:500}),supplierType,text(req.body.spaceLocation,"Space location",{max:2000}),integer(req.body.dailyCustomers,"Daily customers",{max:100000}),req.body.averageCustomerSpend||null,req.body.hourlyPrice||null,text(req.body.partnershipStyle,"Partnership style",{max:120}),text(req.body.availableTimes,"Available times",{max:2000}),text(req.body.offering,"Offering",{required:true,max:4000})]);
  for(const document of documents)await client.query("INSERT INTO supplier_documents(application_id,document_type,file_url,original_name) VALUES($1,$2,$3,$4)",[r.rows[0].id,text(document.type,"Document type",{required:true,max:80}),document.dataUrl,text(document.name,"File name",{required:true,max:255})]);
  await client.query("COMMIT");
  res.status(201).json({application:r.rows[0]});
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}));

router.post("/contact",asyncRoute(async(req,res)=>{const r=await pool.query("INSERT INTO contact_messages(full_name,email,subject,message) VALUES($1,$2,$3,$4) RETURNING id,created_at",[text(req.body.name,"Name",{required:true,max:200}),email(req.body.email),text(req.body.subject,"Subject",{max:200}),text(req.body.message,"Message",{required:true,max:5000})]);res.status(201).json({message:"Message received.",id:r.rows[0].id});}));
router.post("/newsletter",asyncRoute(async(req,res)=>{const value=email(req.body.email);await pool.query(`INSERT INTO newsletter_subscribers(email) VALUES($1) ON CONFLICT(email) DO UPDATE SET unsubscribed_at=NULL,consented_at=now()`,[value]);res.status(201).json({message:"Subscription saved."});}));
export default router;
