SET search_path TO public;

INSERT INTO categories(name,slug,description,status,updated_at) VALUES
 ('Essential Oils','essential-oils','Happy Drops wellness oil collection','ACTIVE',now()),
 ('Food & Nutrition','food-nutrition','Food-related wellness products','ACTIVE',now())
ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,status='ACTIVE',updated_at=now();

WITH items(name,slug,sku,summary,price,category_slug) AS (VALUES
 ('Dew','dew','HD-OIL-001','Dew is made for skin that needs softness, moisture, and a fresh glow. It is perfect for daily skin-care moments when you want your skin to feel hydrated, smooth, and naturally radiant.',24.90,'essential-oils'),
 ('Timeless','timeless','HD-OIL-002','Timeless is created for anti-aging beauty care. It supports a graceful skin-care routine and helps the skin feel smooth, cared for, and refreshed with every gentle application.',19.90,'essential-oils'),
 ('Radiance','radiance','HD-OIL-003','Radiance is designed for skin tightening and glow. It is ideal for beauty routines focused on firm, fresh, and youthful-looking skin with a naturally confident finish.',16.90,'essential-oils'),
 ('Release','release','HD-OIL-004','Release is made for neck and shoulder comfort. It is suitable for gentle massage after a long day, helping the body feel relaxed, lighter, and more comfortable.',17.90,'essential-oils'),
 ('Flow','flow','HD-OIL-005','Flow is designed for a soothing body-care routine. It helps create a relaxed, comfortable feeling during gentle self-care moments.',22.00,'essential-oils'),
 ('Stride','stride','HD-OIL-006','Stride is created for joint and knee support routines. It helps bring a comforting feeling to tired areas and supports easier movement during everyday activities.',19.90,'essential-oils'),
 ('Peace','peace','HD-OIL-007','Peace is made for quiet evening routines and relaxation. It helps create a calm, peaceful atmosphere for rest and self-care.',21.90,'essential-oils'),
 ('Bloom','bloom','HD-OIL-008','Bloom is designed for hair growth support and scalp care. It is ideal for gentle scalp massage, helping the hair feel nourished, fresh, and full of vitality.',21.90,'essential-oils'),
 ('Clarity','clarity','HD-OIL-009','Clarity supports focus and concentration. It is perfect for study, work, or mindful moments when you want a clear mind and a fresh, focused feeling.',22.90,'essential-oils'),
 ('Nourish','nourish','HD-OIL-010','Nourish is designed for gentle skin care and daily body-care routines. It helps the skin feel soft, smooth, and well cared for.',21.90,'essential-oils'),
 ('Calm','calm','HD-OIL-011','Calm is created for quiet relaxation and stress relief. It is ideal for a peaceful self-care routine, helping you feel balanced, soothed, and more comfortable after a busy day.',23.90,'essential-oils'),
 ('Circle Calm','flexibility','HD-OIL-012','Circle Calm is designed for quiet self-care moments and a peaceful atmosphere. It brings a soft, soothing feel to your everyday routine.',24.90,'essential-oils'),
 ('Balance','balance','HD-OIL-013','Balance is designed to support weight management routines and healthy lifestyle habits. It helps create a centered, motivated feeling during your personal wellness journey.',24.90,'essential-oils'),
 ('Harmony','harmony','HD-OIL-014','Harmony is made for digestive wellness and inner balance. It is suitable for gentle abdominal massage and calming self-care moments focused on comfort.',21.90,'essential-oils'),
 ('Passion','passion','HD-OIL-015','Passion supports men''s vitality and confidence. It is ideal for personal wellness routines that encourage energy, connection, and a refreshed feeling.',22.50,'essential-oils'),
 ('Grace','grace','HD-OIL-016','Grace is created for women''s wellness and self-care. It helps support a soft, balanced, and comforting routine for feminine care and emotional calm.',24.00,'essential-oils'),
 ('Joy','joy','HD-OIL-017','Joy is designed for mood support. It helps create a bright, positive, and uplifting feeling, making it perfect for daily emotional wellness routines.',16.90,'essential-oils'),
 ('Presence','presence','HD-OIL-018','Presence is made for meditation and spirituality. It supports calm breathing, mindfulness, inner peace, and quiet moments of personal reflection.',24.90,'essential-oils'),
 ('Vitality','vitality','HD-OIL-019','Vitality is created for energy and motivation. It is ideal for morning routines or moments when you want to feel fresh, active, and inspired.',23.50,'essential-oils'),
 ('Mosquito Spray','mosquito-spray','HD-OIL-020','Mosquito Spray is made for summer outdoor comfort. It helps you enjoy fresh air, garden time, and evening relaxation with a clean and refreshing protective feeling.',18.90,'essential-oils'),
 ('Sauna Relaxation','sauna-relaxation','HD-OIL-021','Sauna Relaxation is created for warm winter self-care moments. It supports deep calm, cozy relaxation, and a peaceful sauna-inspired wellness routine.',22.90,'essential-oils'),
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
