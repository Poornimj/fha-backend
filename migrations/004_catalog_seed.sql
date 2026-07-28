SET search_path TO public;

INSERT INTO categories(name,slug,description,status,updated_at) VALUES
 ('Essential Oils','essential-oils','Happy Drops wellness oil collection','ACTIVE',now()),
 ('Food & Nutrition','food-nutrition','Food-related wellness products','ACTIVE',now())
ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,status='ACTIVE',updated_at=now();

WITH items(name,slug,sku,summary,price,category_slug) AS (VALUES
 ('Dew','dew','HD-OIL-001','Skin Moisture',24.90,'essential-oils'),
 ('Timeless','timeless','HD-OIL-002','Anti-Wrinkle',19.90,'essential-oils'),
 ('Radiance','radiance','HD-OIL-003','Skin Tightening',16.90,'essential-oils'),
 ('Release','release','HD-OIL-004','Neck & Shoulder Comfort',17.90,'essential-oils'),
 ('Flow','flow','HD-OIL-005','Waist Comfort',22.00,'essential-oils'),
 ('Stride','stride','HD-OIL-006','Joint & Knee Support',19.90,'essential-oils'),
 ('Peace','peace','HD-OIL-007','Sleep Like a Baby',21.90,'essential-oils'),
 ('Bloom','bloom','HD-OIL-008','Hair Growth',21.90,'essential-oils'),
 ('Clarity','clarity','HD-OIL-009','Concentration',22.90,'essential-oils'),
 ('Nourish','nourish','HD-OIL-010','Dry Skin Relief',21.90,'essential-oils'),
 ('Calm','calm','HD-OIL-011','Headache Comfort',23.90,'essential-oils'),
 ('Flexibility','flexibility','HD-OIL-012','Joint Comfort',24.90,'essential-oils'),
 ('Balance','balance','HD-OIL-013','Weight Management',24.90,'essential-oils'),
 ('Harmony','harmony','HD-OIL-014','Digestive Wellness',21.90,'essential-oils'),
 ('Passion','passion','HD-OIL-015','Men''s Vitality',22.50,'essential-oils'),
 ('Grace','grace','HD-OIL-016','Women''s Wellness',24.00,'essential-oils'),
 ('Joy','joy','HD-OIL-017','Mood Enhancement',16.90,'essential-oils'),
 ('Presence','presence','HD-OIL-018','Meditation & Spirituality',24.90,'essential-oils'),
 ('Vitality','vitality','HD-OIL-019','Energy Boost',23.50,'essential-oils'),
 ('Mosquito Spray','mosquito-spray','HD-OIL-020','Summer Protection',18.90,'essential-oils'),
 ('Sauna Relaxation','sauna-relaxation','HD-OIL-021','Winter Relaxation',22.90,'essential-oils'),
 ('Magic Sauce','magic-sauce','HD-FOOD-101','Fresh Nordic herb sauce, 250 ml',18.90,'food-nutrition'),
 ('Biotin Beauty Supplement','biotin-beauty-supplement','HD-FOOD-102','Daily biotin supplement, 60 capsules',19.90,'food-nutrition'),
 ('Extra Virgin Olive Oil','extra-virgin-olive-oil','HD-FOOD-103','Cold-extracted olive oil, 500 ml',24.90,'food-nutrition'),
 ('Hemp Seed Oil','hemp-seed-oil','HD-FOOD-104','Cold-pressed culinary hemp oil, 250 ml',22.90,'food-nutrition')
)
INSERT INTO products(category_id,name,slug,sku,short_description,description,price,stock_quantity,featured,status,updated_at)
SELECT c.id,i.name,i.slug,i.sku,i.summary,i.summary,i.price,100,(i.slug IN ('dew','timeless','peace')),'ACTIVE',now()
FROM items i JOIN categories c ON c.slug=i.category_slug
ON CONFLICT(slug) DO UPDATE SET category_id=EXCLUDED.category_id,name=EXCLUDED.name,sku=EXCLUDED.sku,
 short_description=EXCLUDED.short_description,price=EXCLUDED.price,status='ACTIVE',updated_at=now();
