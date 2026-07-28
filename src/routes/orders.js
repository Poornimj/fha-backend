import express from "express";
import { pool } from "../db.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { asyncRoute, email, integer, text } from "../lib/http.js";

const router=express.Router();
const details=`SELECT o.*,COALESCE(json_agg(oi ORDER BY oi.product_name) FILTER(WHERE oi.id IS NOT NULL),'[]') items,
 COALESCE((SELECT json_agg(h ORDER BY h.created_at) FROM order_status_history h WHERE h.order_id=o.id),'[]') history
 FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id`;

router.post("/",optionalAuth,asyncRoute(async(req,res)=>{
 const key=String(req.get("idempotency-key")||"").trim();if(!key)return res.status(400).json({message:"Idempotency-Key header is required."});
 const existing=await pool.query("SELECT response_status,response_body FROM idempotency_keys WHERE key=$1 AND scope='create-order' AND expires_at>now()",[key]);if(existing.rows[0])return res.status(existing.rows[0].response_status).json(existing.rows[0].response_body);
 const items=Array.isArray(req.body.items)?req.body.items:[];if(!items.length)return res.status(400).json({message:"Order items are required."});
 const client=await pool.connect();try{await client.query("BEGIN");let subtotal=0;const lines=[];
  for(const item of items){const quantity=integer(item.quantity,"Quantity",{min:1,max:99,required:true});const p=await client.query("SELECT id,name,sku,price,currency,stock_quantity FROM products WHERE id=$1 AND status='ACTIVE' FOR UPDATE",[item.productId]);if(!p.rows[0])throw Object.assign(new Error("A product is unavailable."),{status:409});if(p.rows[0].stock_quantity<quantity)throw Object.assign(new Error(`${p.rows[0].name} does not have enough stock.`),{status:409});const line=Number(p.rows[0].price)*quantity;subtotal+=line;lines.push({...p.rows[0],quantity,line});}
  const shipping=subtotal>=50?0:5.9;const total=subtotal+shipping;const orderNumber=`HD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  const order=await client.query(`INSERT INTO orders(order_number,user_id,email,phone,subtotal,shipping_amount,tax_amount,discount_amount,total,currency,billing_address,shipping_address,customer_notes,updated_at)
   VALUES($1,$2,$3,$4,$5,$6,0,0,$7,$8,$9,$10,$11,now()) RETURNING *`,[orderNumber,req.user?.id||null,email(req.body.email),text(req.body.phone,"Phone",{max:40}),subtotal,shipping,total,lines[0].currency,req.body.billingAddress||{},req.body.shippingAddress||req.body.billingAddress||{},text(req.body.customerNotes,"Notes",{max:4000})]);
  for(const line of lines){await client.query(`INSERT INTO order_items(order_id,product_id,product_name,sku,unit_price,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6,$7)`,[order.rows[0].id,line.id,line.name,line.sku,line.price,line.quantity,line.line]);await client.query("UPDATE products SET stock_quantity=stock_quantity-$1,updated_at=now() WHERE id=$2",[line.quantity,line.id]);await client.query("INSERT INTO inventory_transactions(product_id,quantity,reason,reference) VALUES($1,$2,'SALE',$3)",[line.id,-line.quantity,orderNumber]);}
  await client.query("INSERT INTO order_status_history(order_id,status,note) VALUES($1,'PENDING','Order created')",[order.rows[0].id]);
  await client.query("INSERT INTO payments(order_id,provider,method_type,amount,currency,status,updated_at) VALUES($1,'manual',$2,$3,$4,'PENDING',now())",[order.rows[0].id,text(req.body.paymentMethod,"Payment method",{max:50})||"pending",total,lines[0].currency]);
  const body={order:order.rows[0]};await client.query("INSERT INTO idempotency_keys(key,user_id,scope,response_status,response_body) VALUES($1,$2,'create-order',201,$3)",[key,req.user?.id||null,body]);await client.query("COMMIT");res.status(201).json(body);
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}));
router.get("/me",requireAuth,asyncRoute(async(req,res)=>{const r=await pool.query(`${details} WHERE o.user_id=$1 GROUP BY o.id ORDER BY o.created_at DESC`,[req.user.id]);res.json({orders:r.rows});}));
router.get("/track/:number",asyncRoute(async(req,res)=>{const emailValue=email(req.query.email);const r=await pool.query(`${details} WHERE o.order_number=$1 AND o.email=$2 GROUP BY o.id`,[req.params.number,emailValue]);if(!r.rows[0])return res.status(404).json({message:"Order not found."});res.json({order:r.rows[0]});}));
export default router;
