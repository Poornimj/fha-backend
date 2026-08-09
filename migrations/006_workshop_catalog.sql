SET search_path TO public;

INSERT INTO workshops (
  title, slug, description, default_price, currency, duration_minutes,
  min_participants, max_participants, status, updated_at
) VALUES
  ('Essential Oil Workshop', 'essential-oil-workshop',
   'Learn how essential oils can support common wellness questions in a natural and practical way.',
   48, 'EUR', 120, 1, 30, 'ACTIVE', now()),
  ('Dumpling DIY + Nutrition Workshop', 'dumpling-diy-nutrition-workshop',
   'Enjoy a hands-on dumpling-making experience while learning simple nutrition tips.',
   55, 'EUR', 120, 1, 30, 'ACTIVE', now()),
  ('Special Event Workshop', 'special-event-workshop',
   'A memorable wellness experience for birthdays, celebrations, and special occasions.',
   65, 'EUR', 120, 1, 100, 'ACTIVE', now()),
  ('Business Purpose Workshop', 'business-purpose-workshop',
   'Wellness activities designed for meetings, team-building days, and workplace wellbeing.',
   48, 'EUR', 120, 1, 100, 'ACTIVE', now())
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  default_price = EXCLUDED.default_price,
  duration_minutes = EXCLUDED.duration_minutes,
  min_participants = EXCLUDED.min_participants,
  max_participants = EXCLUDED.max_participants,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO workshop_sessions (
  workshop_id, starts_at, ends_at, location, capacity, price_per_person, status
)
SELECT w.id, session.starts_at, session.ends_at, session.location, session.capacity, session.price, 'ACTIVE'
FROM (
  VALUES
    ('essential-oil-workshop', TIMESTAMP '2026-08-25 14:00', TIMESTAMP '2026-08-25 16:00',
     'Happy Drops Studio, Helsinki', 20, 48::numeric),
    ('dumpling-diy-nutrition-workshop', TIMESTAMP '2026-08-30 12:00', TIMESTAMP '2026-08-30 14:00',
     'Happy Drops Studio, Helsinki', 20, 55::numeric)
) AS session(slug, starts_at, ends_at, location, capacity, price)
JOIN workshops w ON w.slug = session.slug
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_sessions existing
  WHERE existing.workshop_id = w.id
    AND existing.starts_at = session.starts_at
    AND existing.location = session.location
);
