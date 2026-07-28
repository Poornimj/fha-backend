import express from "express";
import { pool } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncRoute, integer, text, uuid } from "../lib/http.js";

const router=express.Router();
router.use(requireAuth,requireRole("STAFF","ADMIN"));

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
 let imageUrl;
 if(req.body.posterDataUrl!==undefined){
  imageUrl=String(req.body.posterDataUrl||"");
  if(imageUrl&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(imageUrl)){
   return res.status(400).json({message:"Poster must be a PNG, JPEG, or WebP image."});
  }
  if(imageUrl.length>5_600_000)return res.status(413).json({message:"Poster must be smaller than 4 MB."});
 }
 const r=await pool.query(`UPDATE workshops SET
  theme=COALESCE($1,theme),
  image_url=CASE WHEN $2::boolean THEN NULLIF($3,'') ELSE image_url END,
  updated_at=now()
  WHERE id=$4 RETURNING *`,
  [theme,req.body.posterDataUrl!==undefined,imageUrl||"",uuid(req.params.id,"Workshop ID")]);
 if(!r.rows[0])return res.status(404).json({message:"Workshop not found."});
 res.json({workshop:r.rows[0]});
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
router.get("/dashboard",asyncRoute(async(_req,res)=>{const r=await pool.query(`SELECT (SELECT count(*) FROM orders) orders,(SELECT count(*) FROM orders WHERE status IN('PENDING','CONFIRMED','PROCESSING')) open_orders,(SELECT count(*) FROM supplier_applications WHERE status IN('SUBMITTED','UNDER_REVIEW')) supplier_applications,(SELECT count(*) FROM knowledge_questions WHERE status IN('submitted','reviewing')) knowledge_questions,(SELECT count(*) FROM products WHERE stock_quantity<=5 AND status='ACTIVE') low_stock`);res.json({dashboard:r.rows[0]});}));
export default router;
