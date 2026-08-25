SET search_path TO public;

-- Replace the provisional schedules for the two public upcoming workshops
-- with the confirmed autumn 2026 sessions. Historical bookings remain linked
-- to their original sessions, which are retained as inactive records.
UPDATE workshop_sessions session
SET status = 'INACTIVE'
FROM workshops workshop
WHERE session.workshop_id = workshop.id
  AND workshop.slug IN (
    'essential-oil-workshop',
    'dumpling-diy-nutrition-workshop'
  )
  AND session.status = 'ACTIVE';

INSERT INTO workshop_sessions (
  workshop_id,
  starts_at,
  ends_at,
  location,
  capacity,
  price_per_person,
  status
)
SELECT
  workshop.id,
  schedule.starts_at,
  schedule.ends_at,
  'Peachy, Kamppi',
  20,
  workshop.default_price,
  'ACTIVE'
FROM (
  VALUES
    ('essential-oil-workshop', TIMESTAMP '2026-09-12 14:00', TIMESTAMP '2026-09-12 16:00'),
    ('dumpling-diy-nutrition-workshop', TIMESTAMP '2026-11-01 13:00', TIMESTAMP '2026-11-01 15:00')
) AS schedule(slug, starts_at, ends_at)
JOIN workshops workshop ON workshop.slug = schedule.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM workshop_sessions existing
  WHERE existing.workshop_id = workshop.id
    AND existing.starts_at = schedule.starts_at
    AND existing.status = 'ACTIVE'
);
