import express from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncRoute, integer, text, uuid } from "../lib/http.js";
import { sendWellnessStatusEmail } from "../services/email.js";

const router=express.Router();
router.use(requireAuth,requireRole("STAFF","ADMIN"));

const wellnessStatuses=["SUBMITTED","UNDER_REVIEW","RECIPE_READY","PAYMENT_PENDING","PAID","IN_PREPARATION","READY_FOR_PICKUP","COMPLETED","CANCELLED"];
const wellnessPaymentStatuses=["PENDING","AUTHORIZED","PAID","FAILED","CANCELLED","REFUNDED"];

router.get("/wellness-cases",asyncRoute(async(req,res)=>{
 const status=text(req.query.status,"Status",{max:40})?.toUpperCase()||null;
 const search=text(req.query.search,"Search",{max:200});
 if(status&&!wellnessStatuses.includes(status))return res.status(400).json({message:"Invalid wellness status."});
 const r=await pool.query(`SELECT c.*,u.email,u.first_name,u.family_name,u.phone,
  COALESCE((SELECT json_agg(h ORDER BY h.created_at) FROM wellness_review_history h WHERE h.case_id=c.id),'[]') history
  FROM wellness_review_cases c JOIN users u ON u.id=c.user_id
  WHERE ($1::text IS NULL OR c.status=$1)
  AND ($2::text IS NULL OR concat_ws(' ',c.reference,u.first_name,u.family_name,u.email,c.profile_snapshot->>'current_symptoms') ILIKE $2)
  ORDER BY c.created_at DESC LIMIT 200`,[status,search?`%${search}%`:null]);
 res.json({cases:r.rows});
}));

router.patch("/wellness-cases/:id",asyncRoute(async(req,res)=>{
 const status=text(req.body.status,"Status",{required:true,max:40}).toUpperCase();
 if(!wellnessStatuses.includes(status))return res.status(400).json({message:"Invalid wellness status."});
 const paymentStatus=text(req.body.paymentStatus,"Payment status",{max:40})?.toUpperCase()||null;
 if(paymentStatus&&!wellnessPaymentStatuses.includes(paymentStatus))return res.status(400).json({message:"Invalid payment status."});
 const ingredients=req.body.recipeIngredients;
 if(ingredients!==undefined&&!Array.isArray(ingredients))return res.status(400).json({message:"Recipe ingredients must be a list."});
 const price=req.body.price===""||req.body.price==null?null:Number(req.body.price);
 if(price!==null&&(!Number.isFinite(price)||price<0))return res.status(400).json({message:"Price is invalid."});
 const message=text(req.body.reviewerMessage,"Customer message",{max:10000});
 const visible=req.body.visibleToCustomer!==false;
 const client=await pool.connect();
 let reviewCase;
 let customer;
 try{
  await client.query("BEGIN");
  const r=await client.query(`UPDATE wellness_review_cases SET
   status=$1::varchar,reviewer_id=$2,reviewer_message=COALESCE($3::text,reviewer_message),
   recipe_title=COALESCE($4,recipe_title),recipe_instructions=COALESCE($5,recipe_instructions),
   recipe_ingredients=COALESCE($6::jsonb,recipe_ingredients),safety_notes=COALESCE($7,safety_notes),
   price=COALESCE($8,price),currency=COALESCE($9,currency),payment_status=COALESCE($10,payment_status),
   pickup_location=COALESCE($11,pickup_location),pickup_date=COALESCE($12::date,pickup_date),pickup_time=COALESCE($13::time,pickup_time),
   reviewed_at=CASE WHEN $1::varchar IN('UNDER_REVIEW','RECIPE_READY','PAYMENT_PENDING','PAID','IN_PREPARATION','READY_FOR_PICKUP','COMPLETED') THEN COALESCE(reviewed_at,now()) ELSE reviewed_at END,
   paid_at=CASE WHEN $1::varchar IN('PAID','IN_PREPARATION','READY_FOR_PICKUP','COMPLETED') OR $10::varchar='PAID' THEN COALESCE(paid_at,now()) ELSE paid_at END,
   ready_at=CASE WHEN $1::varchar IN('READY_FOR_PICKUP','COMPLETED') THEN COALESCE(ready_at,now()) ELSE ready_at END,
   completed_at=CASE WHEN $1::varchar='COMPLETED' THEN COALESCE(completed_at,now()) ELSE completed_at END,
   updated_at=now() WHERE id=$14 RETURNING *`,[
    status,req.user.id,message,text(req.body.recipeTitle,"Recipe title",{max:250}),
    text(req.body.recipeInstructions,"Recipe instructions",{max:10000}),
    ingredients===undefined?null:JSON.stringify(ingredients),text(req.body.safetyNotes,"Safety notes",{max:5000}),
    price,text(req.body.currency,"Currency",{max:3})?.toUpperCase()||null,paymentStatus,
    text(req.body.pickupLocation,"Pickup location",{max:2000}),req.body.pickupDate||null,req.body.pickupTime||null,
    uuid(req.params.id,"Wellness case ID")]);
  if(!r.rows[0]){await client.query("ROLLBACK");return res.status(404).json({message:"Wellness case not found."});}
  reviewCase=r.rows[0];
  await client.query(`INSERT INTO wellness_review_history(case_id,status,message,changed_by,visible_to_customer)
   VALUES($1,$2,$3,$4,$5)`,[reviewCase.id,status,message||`Status changed to ${status.replaceAll("_"," ").toLowerCase()}.`,req.user.id,visible]);
  const userResult=await client.query("SELECT id,email,first_name,family_name FROM users WHERE id=$1",[reviewCase.user_id]);
  customer=userResult.rows[0];
  await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details,ip_address)
   VALUES($1,'WELLNESS_CASE_UPDATED','wellness_review_case',$2,$3::jsonb,$4)`,[req.user.id,reviewCase.id,JSON.stringify({status,paymentStatus:reviewCase.payment_status,visibleToCustomer:visible}),req.ip]);
  await client.query("COMMIT");
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
 const emailDelivery=req.body.notifyCustomer===false?{skipped:true}:await sendWellnessStatusEmail({user:customer,reviewCase});
 res.json({reviewCase,emailDelivery});
}));

router.patch("/orders/:id/status",asyncRoute(async(req,res)=>{
 const status=text(req.body.status,"Status",{required:true,max:40}).toUpperCase();
 const allowed=["PENDING","CONFIRMED","PROCESSING","SHIPPED","DELIVERED","CANCELLED","REFUNDED"];
 if(!allowed.includes(status))return res.status(400).json({message:"Invalid order status."});
 const client=await pool.connect();try{await client.query("BEGIN");const r=await client.query("UPDATE orders SET status=$1,updated_at=now() WHERE id=$2 RETURNING *",[status,uuid(req.params.id)]);if(!r.rows[0]){await client.query("ROLLBACK");return res.status(404).json({message:"Order not found."});}await client.query("INSERT INTO order_status_history(order_id,status,note,changed_by) VALUES($1,$2,$3,$4)",[r.rows[0].id,status,text(req.body.note,"Note",{max:1000}),req.user.id]);await client.query("COMMIT");res.json({order:r.rows[0]});}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
router.get("/suppliers",requireRole("ADMIN"),asyncRoute(async(req,res)=>{
 const status=text(req.query.status,"Status",{max:40})?.toUpperCase()||null;
 const search=text(req.query.search,"Search",{max:200});
 const r=await pool.query(`SELECT sa.*,COALESCE((SELECT json_agg(sd ORDER BY sd.created_at) FROM supplier_documents sd WHERE sd.application_id=sa.id),'[]') documents
  FROM supplier_applications sa WHERE ($1::text IS NULL OR sa.status::text=$1)
  AND ($2::text IS NULL OR concat_ws(' ',sa.company_name,sa.contact_name,sa.email,sa.supplier_type) ILIKE $2)
  ORDER BY sa.created_at DESC`,[status,search?`%${search}%`:null]);
 res.json({applications:r.rows});
}));
router.patch("/suppliers/:id",requireRole("ADMIN"),asyncRoute(async(req,res)=>{const status=text(req.body.status,"Status",{required:true,max:40}).toUpperCase();const allowed=["SUBMITTED","UNDER_REVIEW","APPROVED","REJECTED","WITHDRAWN"];if(!allowed.includes(status))return res.status(400).json({message:"Invalid application status."});const r=await pool.query("UPDATE supplier_applications SET status=$1,admin_notes=$2,updated_at=now() WHERE id=$3 RETURNING *",[status,text(req.body.adminNotes,"Admin notes",{max:5000}),uuid(req.params.id)]);if(!r.rows[0])return res.status(404).json({message:"Application not found."});res.json({application:r.rows[0]});}));
router.get("/therapists",requireRole("ADMIN"),asyncRoute(async(req,res)=>{
 const status=text(req.query.status,"Status",{max:40})?.toUpperCase()||null;
 const search=text(req.query.search,"Search",{max:200});
 const r=await pool.query(`SELECT ta.*,COALESCE((SELECT json_agg(td ORDER BY td.created_at) FROM therapist_documents td WHERE td.application_id=ta.id),'[]') documents
  FROM therapist_applications ta WHERE ($1::text IS NULL OR ta.status::text=$1)
  AND ($2::text IS NULL OR concat_ws(' ',ta.full_name,ta.email,ta.phone,ta.location,ta.qualifications) ILIKE $2)
  ORDER BY ta.created_at DESC`,[status,search?`%${search}%`:null]);
 res.json({applications:r.rows});
}));
router.patch("/therapists/:id",requireRole("ADMIN"),asyncRoute(async(req,res)=>{const status=text(req.body.status,"Status",{required:true,max:40}).toUpperCase();const allowed=["SUBMITTED","UNDER_REVIEW","APPROVED","REJECTED","WITHDRAWN"];if(!allowed.includes(status))return res.status(400).json({message:"Invalid application status."});const r=await pool.query("UPDATE therapist_applications SET status=$1,admin_notes=$2,updated_at=now() WHERE id=$3 RETURNING *",[status,text(req.body.adminNotes,"Admin notes",{max:5000}),uuid(req.params.id)]);if(!r.rows[0])return res.status(404).json({message:"Application not found."});res.json({application:r.rows[0]});}));
router.post("/knowledge/questions/:id/answers",asyncRoute(async(req,res)=>{const client=await pool.connect();try{await client.query("BEGIN");const r=await client.query("INSERT INTO knowledge_answers(question_id,answered_by,answer,is_published) VALUES($1,$2,$3,$4) RETURNING *",[uuid(req.params.id),req.user.id,text(req.body.answer,"Answer",{required:true,max:10000}),req.body.isPublished!==false]);await client.query("UPDATE knowledge_questions SET status='answered',updated_at=now() WHERE id=$1",[req.params.id]);await client.query("COMMIT");res.status(201).json({answer:r.rows[0]});}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}));
router.post("/knowledge/questions/:id/recipes",asyncRoute(async(req,res)=>{
 const question=await pool.query("SELECT user_id FROM knowledge_questions WHERE id=$1",[uuid(req.params.id)]);
 if(!question.rows[0])return res.status(404).json({message:"Question not found."});
 const ingredients=Array.isArray(req.body.ingredients)?req.body.ingredients:[];
 const r=await pool.query(`INSERT INTO personalized_recipes(user_id,question_id,title,instructions,ingredients,safety_notes,price,currency,created_by)
  VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9) RETURNING *`,
  [question.rows[0].user_id,req.params.id,text(req.body.title,"Title",{required:true,max:250}),text(req.body.instructions,"Instructions",{required:true,max:10000}),JSON.stringify(ingredients),text(req.body.safetyNotes,"Safety notes",{max:5000}),req.body.price??null,String(req.body.currency||"EUR").slice(0,3).toUpperCase(),req.user.id]);
 res.status(201).json({recipe:r.rows[0]});
}));
router.patch("/knowledge/recipes/:id/status",asyncRoute(async(req,res)=>{
 const status=text(req.body.status,"Status",{required:true,max:30}).toLowerCase();
 if(!["recipe_ready","paid","preparing","ready","collected"].includes(status))return res.status(400).json({message:"Invalid preparation status."});
 const r=await pool.query(`UPDATE personalized_recipes SET preparation_status=$1,payment_status=CASE WHEN $1 IN('paid','preparing','ready','collected') THEN 'paid' ELSE payment_status END,paid_at=CASE WHEN $1 IN('paid','preparing','ready','collected') AND paid_at IS NULL THEN now() ELSE paid_at END,pickup_location=COALESCE($2,pickup_location),updated_at=now() WHERE id=$3 RETURNING *`,[status,text(req.body.pickupLocation,"Pickup location",{max:1000}),uuid(req.params.id)]);
 if(!r.rows[0])return res.status(404).json({message:"Recipe not found."});res.json({recipe:r.rows[0]});
}));
router.patch("/products/:id/inventory",asyncRoute(async(req,res)=>{const quantity=integer(req.body.quantity,"Quantity",{min:-100000,max:100000,required:true});if(quantity===0)return res.status(400).json({message:"Quantity must not be zero."});const client=await pool.connect();try{await client.query("BEGIN");const r=await client.query("UPDATE products SET stock_quantity=stock_quantity+$1,updated_at=now() WHERE id=$2 AND stock_quantity+$1>=0 RETURNING *",[quantity,uuid(req.params.id)]);if(!r.rows[0]){await client.query("ROLLBACK");return res.status(409).json({message:"Inventory adjustment is invalid."});}await client.query("INSERT INTO inventory_transactions(product_id,quantity,reason,reference,notes) VALUES($1,$2,'ADJUSTMENT',$3,$4)",[r.rows[0].id,quantity,text(req.body.reference,"Reference",{max:150}),text(req.body.notes,"Notes",{max:2000})]);await client.query("COMMIT");res.json({product:r.rows[0]});}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}));
router.patch("/workshops/:id",requireRole("ADMIN"),asyncRoute(async(req,res)=>{
 const theme=text(req.body.theme,"Theme",{max:200});
 const sessionDate=text(req.body.sessionDate,"Workshop date",{max:10});
 const sessionTime=text(req.body.sessionTime,"Workshop time",{max:5});
 const sessionLocation=text(req.body.sessionLocation,"Workshop place",{max:250});
 const durationMinutes=integer(req.body.durationMinutes,"Workshop duration",{min:15,max:1440});
 if((sessionDate&&!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate))||(sessionTime&&!/^\d{2}:\d{2}$/.test(sessionTime))){
  return res.status(400).json({message:"Workshop date or time is invalid."});
 }
 if(Boolean(sessionDate)!==Boolean(sessionTime))return res.status(400).json({message:"Enter both the workshop date and time."});
 let imageUrl;
 if(req.body.posterDataUrl!==undefined){
  imageUrl=String(req.body.posterDataUrl||"");
  if(imageUrl&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageUrl)){
   return res.status(400).json({message:"Poster must be a PNG, JPEG, or WebP image."});
  }
  if(imageUrl.length>5_600_000)return res.status(413).json({message:"Poster must be smaller than 4 MB."});
 }
 const workshopId=uuid(req.params.id,"Workshop ID");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const updated=await client.query(`UPDATE workshops SET
   theme=COALESCE($1,theme),image_url=CASE WHEN $2::boolean THEN NULLIF($3,'') ELSE image_url END,
   duration_minutes=COALESCE($4,duration_minutes),updated_at=now()
   WHERE id=$5 RETURNING *`,[theme,req.body.posterDataUrl!==undefined,imageUrl||"",durationMinutes,workshopId]);
  if(!updated.rows[0]){await client.query("ROLLBACK");return res.status(404).json({message:"Workshop not found."});}
  if(sessionDate||sessionTime||sessionLocation||durationMinutes){
   const session=await client.query(`UPDATE workshop_sessions SET
    starts_at=CASE WHEN $1::date IS NOT NULL AND $2::time IS NOT NULL THEN $1::date+$2::time ELSE starts_at END,
    ends_at=(CASE WHEN $1::date IS NOT NULL AND $2::time IS NOT NULL THEN $1::date+$2::time ELSE starts_at END)+($3::int*interval '1 minute'),
    location=COALESCE($4,location)
    WHERE id=(SELECT id FROM workshop_sessions WHERE workshop_id=$5 AND status='ACTIVE' ORDER BY starts_at LIMIT 1) RETURNING id`,
    [sessionDate,sessionTime,updated.rows[0].duration_minutes||120,sessionLocation,workshopId]);
   if(!session.rows[0]&&sessionDate&&sessionTime)await client.query(`INSERT INTO workshop_sessions(workshop_id,starts_at,ends_at,location,capacity,price_per_person,status)
    VALUES($1,$2::date+$3::time,$2::date+$3::time+($4::int*interval '1 minute'),COALESCE($7,'Location to be confirmed'),$5,$6,'ACTIVE')`,
    [workshopId,sessionDate,sessionTime,updated.rows[0].duration_minutes||120,updated.rows[0].max_participants||30,updated.rows[0].default_price,sessionLocation]);
  }
  const result=await client.query(`SELECT w.*,COALESCE(json_agg(s ORDER BY s.starts_at) FILTER(WHERE s.id IS NOT NULL),'[]') sessions
   FROM workshops w LEFT JOIN workshop_sessions s ON s.workshop_id=w.id AND s.status='ACTIVE' WHERE w.id=$1 GROUP BY w.id`,[workshopId]);
  await client.query("COMMIT");
  res.json({workshop:result.rows[0]});
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}));

function workshopSessionInput(body,{partial=false}={}){
 const sessionDate=text(body.sessionDate,"Workshop date",{max:10});
 const sessionTime=text(body.sessionTime,"Workshop time",{max:5});
 const location=text(body.location,"Workshop place",{required:!partial,max:250});
 const durationMinutes=integer(body.durationMinutes,"Workshop duration",{min:15,max:1440,required:!partial});
 const capacity=integer(body.capacity,"Workshop capacity",{min:1,max:1000,required:!partial});
 if((sessionDate&&!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate))||(sessionTime&&!/^\d{2}:\d{2}$/.test(sessionTime))){
  throw Object.assign(new Error("Workshop date or time is invalid."),{status:400});
 }
 if(!partial&&(!sessionDate||!sessionTime))throw Object.assign(new Error("Enter both the workshop date and time."),{status:400});
 if(partial&&Boolean(sessionDate)!==Boolean(sessionTime))throw Object.assign(new Error("Enter both the workshop date and time."),{status:400});
 return {sessionDate,sessionTime,location,durationMinutes,capacity};
}

router.post("/workshops/:id/sessions",requireRole("ADMIN"),asyncRoute(async(req,res)=>{
 const workshopId=uuid(req.params.id,"Workshop ID");
 const values=workshopSessionInput(req.body);
 const workshop=await pool.query("SELECT default_price FROM workshops WHERE id=$1",[workshopId]);
 if(!workshop.rows[0])return res.status(404).json({message:"Workshop not found."});
 const result=await pool.query(`INSERT INTO workshop_sessions(workshop_id,starts_at,ends_at,location,capacity,price_per_person,status)
  VALUES($1,$2::date+$3::time,$2::date+$3::time+($4::int*interval '1 minute'),$5,$6,$7,'ACTIVE') RETURNING *`,
  [workshopId,values.sessionDate,values.sessionTime,values.durationMinutes,values.location,values.capacity,workshop.rows[0].default_price]);
 res.status(201).json({session:result.rows[0]});
}));

router.patch("/workshops/:workshopId/sessions/:sessionId",requireRole("ADMIN"),asyncRoute(async(req,res)=>{
 const workshopId=uuid(req.params.workshopId,"Workshop ID");
 const sessionId=uuid(req.params.sessionId,"Session ID");
 const values=workshopSessionInput(req.body,{partial:true});
 const result=await pool.query(`UPDATE workshop_sessions SET
  starts_at=CASE WHEN $1::date IS NOT NULL AND $2::time IS NOT NULL THEN $1::date+$2::time ELSE starts_at END,
  ends_at=(CASE WHEN $1::date IS NOT NULL AND $2::time IS NOT NULL THEN $1::date+$2::time ELSE starts_at END)
    +(COALESCE($3::int,GREATEST(15,EXTRACT(EPOCH FROM (ends_at-starts_at))/60)::int)*interval '1 minute'),
  location=COALESCE($4,location),capacity=COALESCE($5,capacity)
  WHERE id=$6 AND workshop_id=$7 AND status='ACTIVE' RETURNING *`,
  [values.sessionDate,values.sessionTime,values.durationMinutes,values.location,values.capacity,sessionId,workshopId]);
 if(!result.rows[0])return res.status(404).json({message:"Workshop session not found."});
 res.json({session:result.rows[0]});
}));

router.delete("/workshops/:workshopId/sessions/:sessionId",requireRole("ADMIN"),asyncRoute(async(req,res)=>{
 const result=await pool.query("UPDATE workshop_sessions SET status='INACTIVE' WHERE id=$1 AND workshop_id=$2 AND status='ACTIVE' RETURNING id",
  [uuid(req.params.sessionId,"Session ID"),uuid(req.params.workshopId,"Workshop ID")]);
 if(!result.rows[0])return res.status(404).json({message:"Workshop session not found."});
 res.status(204).end();
}));
router.get("/workshops/requests",requireRole("ADMIN"),asyncRoute(async(req,res)=>{
 const location=text(req.query.location,"Location",{max:250});
 const search=text(req.query.search,"Search",{max:200});
 const workshopId=req.query.workshopId?uuid(req.query.workshopId,"Workshop ID"):null;
 const preferredDate=text(req.query.date,"Date",{max:10});
 if(preferredDate&&!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate))return res.status(400).json({message:"Date is invalid."});
 const status=text(req.query.status,"Status",{max:40})?.toUpperCase()||null;
 if(status&&!["SUBMITTED","UNDER_REVIEW","APPROVED","REJECTED","WITHDRAWN"].includes(status))return res.status(400).json({message:"Status is invalid."});
 const isExport=req.query.export==="true";
 const page=isExport?1:integer(req.query.page,"Page",{min:1,max:100000})||1;
 const limit=isExport?5000:integer(req.query.limit,"Limit",{min:1,max:50})||10;
 const offset=(page-1)*limit;
 const params=[location,search?`%${search}%`:null,workshopId,preferredDate,status];
 const where=`WHERE ($1::text IS NULL OR wr.location=$1)
  AND ($2::text IS NULL OR concat_ws(' ',wr.full_name,wr.email,wr.phone) ILIKE $2)
  AND ($3::uuid IS NULL OR wr.workshop_id=$3)
  AND ($4::date IS NULL OR wr.preferred_date=$4)
  AND ($5::text IS NULL OR wr.status::text=$5)`;
 const summary=await pool.query(`SELECT count(*)::int total_bookings,
  COALESCE(sum(wr.participant_count),0)::int total_participants,
  COALESCE(sum(COALESCE(w.default_price,0)*COALESCE(wr.participant_count,0)),0)::numeric(12,2) total_price
  FROM workshop_requests wr LEFT JOIN workshops w ON w.id=wr.workshop_id ${where}`,params);
 const r=await pool.query(`SELECT wr.*,w.title workshop_title,w.theme,w.default_price,
  (COALESCE(w.default_price,0)*COALESCE(wr.participant_count,0)) total_price,w.currency,
  u.first_name account_first_name,u.family_name account_family_name
  FROM workshop_requests wr
  LEFT JOIN workshops w ON w.id=wr.workshop_id
  LEFT JOIN users u ON u.id=wr.user_id
  ${where}
  ORDER BY wr.preferred_date DESC NULLS LAST,wr.created_at DESC LIMIT $6 OFFSET $7`,[...params,limit,offset]);
 res.json({requests:r.rows,summary:summary.rows[0],pagination:{page,limit,total:summary.rows[0].total_bookings,totalPages:Math.max(1,Math.ceil(summary.rows[0].total_bookings/limit))}});
}));
router.get("/customers", requireRole("ADMIN"), asyncRoute(async (req, res) => {
  const search = text(req.query.search, "Search", { max: 200 });
  const isExport = req.query.export === "true";

  const result = await pool.query(`
    SELECT
      u.id,
      u.email,
      u.first_name,
      u.family_name,
      u.phone,
      u.address,
      u.date_of_birth,
      u.preferred_language,
      u.role,
      u.account_type,
      u.company_name,
      u.business_id,
      u.is_active,
      u.created_at,
      u.updated_at,

      (SELECT COUNT(*)
       FROM orders o
       WHERE o.user_id = u.id) AS order_count,

      (SELECT COUNT(*)
       FROM workshop_requests wr
       WHERE wr.user_id = u.id) AS workshop_request_count,

      (SELECT COUNT(*)
       FROM wellness_review_cases wc
       WHERE wc.user_id = u.id) AS wellness_case_count

    FROM users u

    WHERE u.role = 'CUSTOMER'
AND (
  $1::text IS NULL
  OR concat_ws(
    ' ',
    u.first_name,
    u.family_name,
    u.email,
    u.phone,
    u.company_name,
    u.business_id
  ) ILIKE $1
)

    ORDER BY u.created_at DESC
    LIMIT ${isExport ? 5000 : 500}
  `, [search ? `%${search}%` : null]);
  if (isExport) {
  const rows = result.rows;

  const csvEscape = (value) => {
    const textValue = String(value ?? "");
    return `"${textValue.replaceAll('"', '""')}"`;
  };

  const header = [
    "First Name",
    "Family Name",
    "Email",
    "Phone",
    "Account Type",
    "Company",
    "Business ID",
    "Preferred Language",
    "Active",
    "Registered",
    "Orders",
    "Workshop Requests",
    "Wellness Cases"
  ];

  const csv = [
    header.map(csvEscape).join(","),
    ...rows.map((customer) => [
      customer.first_name,
      customer.family_name,
      customer.email,
      customer.phone,
      customer.account_type,
      customer.company_name,
      customer.business_id,
      customer.preferred_language,
      customer.is_active,
      customer.created_at,
      customer.order_count,
      customer.workshop_request_count,
      customer.wellness_case_count
    ].map(csvEscape).join(","))
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=happy-drops-customers.csv");
  return res.send("\uFEFF" + csv);
}

  res.json({ customers: result.rows });
}));
router.patch("/customers/:id/status", requireRole("ADMIN"), asyncRoute(async (req, res) => {
  const customerId = uuid(req.params.id, "Customer ID");

  if (typeof req.body.isActive !== "boolean") {
    return res.status(400).json({
      message: "isActive must be true or false."
    });
  }

  const result = await pool.query(
    `UPDATE users
     SET is_active = $1,
         updated_at = now()
     WHERE id = $2
       AND role = 'CUSTOMER'
     RETURNING
       id,
       email,
       first_name,
       family_name,
       is_active,
       updated_at`,
    [req.body.isActive, customerId]
  );

  if (!result.rows[0]) {
    return res.status(404).json({
      message: "Customer not found."
    });
  }

  res.json({ customer: result.rows[0] });
}));
router.get("/orders", requireRole("ADMIN"), asyncRoute(async (req, res) => {
  const search = text(req.query.search, "Search", { max: 200 });
  const status = text(req.query.status, "Status", { max: 40 })?.toUpperCase() || null;
  const paymentStatus = text(req.query.paymentStatus, "Payment status", { max: 40 })?.toUpperCase() || null;
  const isExport = req.query.export === "true";

  const result = await pool.query(`
    SELECT
      o.id,
      o.order_number,
      o.user_id,
      o.email,
      o.phone,
      o.status,
      o.payment_status,
      o.subtotal,
      o.shipping_amount,
      o.tax_amount,
      o.discount_amount,
      o.total,
      o.currency,
      o.billing_address,
      o.shipping_address,
      o.customer_notes,
      o.created_at,
      o.updated_at,

      u.first_name,
      u.family_name,

      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'product_name', oi.product_name,
              'sku', oi.sku,
              'unit_price', oi.unit_price,
              'quantity', oi.quantity,
              'line_total', oi.line_total
            )
            ORDER BY oi.product_name
          )
          FROM order_items oi
          WHERE oi.order_id = o.id
        ),
        '[]'::json
      ) AS items,

      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', p.id,
              'provider', p.provider,
              'method_type', p.method_type,
              'amount', p.amount,
              'refunded_amount', p.refunded_amount,
              'currency', p.currency,
              'status', p.status,
              'paid_at', p.paid_at,
              'provider_transaction_id', p.provider_transaction_id,
              'stripe_checkout_session_id', p.stripe_checkout_session_id,
              'stripe_payment_intent_id', p.stripe_payment_intent_id,
              'failure_message', p.failure_message,
              'created_at', p.created_at
            )
            ORDER BY p.created_at DESC
          )
          FROM payments p
          WHERE p.order_id = o.id
        ),
        '[]'::json
      ) AS payments

    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id

    WHERE
      ($1::text IS NULL OR o.status::text = $1)
      AND ($2::text IS NULL OR o.payment_status::text = $2)
      AND (
        $3::text IS NULL
        OR concat_ws(
          ' ',
          o.order_number,
          o.email,
          o.phone,
          u.first_name,
          u.family_name
        ) ILIKE $3
      )

    ORDER BY o.created_at DESC
    LIMIT ${isExport ? 5000 : 500}
  `, [
    status,
    paymentStatus,
    search ? `%${search}%` : null
  ]);
  if (isExport) {
  const csvEscape = (value) => {
    const textValue = String(value ?? "");
    return `"${textValue.replaceAll('"', '""')}"`;
  };

  const header = [
    "Order Number",
    "Customer First Name",
    "Customer Family Name",
    "Email",
    "Phone",
    "Order Status",
    "Payment Status",
    "Subtotal",
    "Shipping",
    "Tax",
    "Discount",
    "Total",
    "Currency",
    "Products",
    "Payment Provider",
    "Payment Method",
    "Payment Amount",
    "Payment Record Status",
    "Paid At",
    "Stripe Checkout Session",
    "Stripe Payment Intent",
    "Created At"
  ];

  const csv = [
    header.map(csvEscape).join(","),
    ...result.rows.map((order) => {
      const products = (order.items || [])
        .map((item) => `${item.quantity} x ${item.product_name}`)
        .join("; ");

      const latestPayment = order.payments?.[0] || {};

      return [
        order.order_number,
        order.first_name,
        order.family_name,
        order.email,
        order.phone,
        order.status,
        order.payment_status,
        order.subtotal,
        order.shipping_amount,
        order.tax_amount,
        order.discount_amount,
        order.total,
        order.currency,
        products,
        latestPayment.provider,
        latestPayment.method_type,
        latestPayment.amount,
        latestPayment.status,
        latestPayment.paid_at,
        latestPayment.stripe_checkout_session_id,
        latestPayment.stripe_payment_intent_id,
        order.created_at
      ].map(csvEscape).join(",");
    })
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=happy-drops-orders-payments.csv"
  );

  return res.send("\uFEFF" + csv);
}

  res.json({ orders: result.rows });
}));
router.get("/dashboard",asyncRoute(async(_req,res)=>{const r=await pool.query(`SELECT (SELECT count(*) FROM orders) orders,(SELECT count(*) FROM orders WHERE status IN('PENDING','CONFIRMED','PROCESSING')) open_orders,(SELECT count(*) FROM supplier_applications WHERE status IN('SUBMITTED','UNDER_REVIEW')) supplier_applications,(SELECT count(*) FROM knowledge_questions WHERE status IN('submitted','reviewing')) knowledge_questions,(SELECT count(*) FROM products WHERE stock_quantity<=5 AND status='ACTIVE') low_stock`);res.json({dashboard:r.rows[0]});}));
export default router;
