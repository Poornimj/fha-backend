SET search_path TO public;

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS theme VARCHAR(200);

UPDATE workshops SET theme = CASE slug
  WHEN 'essential-oil-workshop' THEN 'Natural wellness with essential oils'
  WHEN 'dumpling-diy-nutrition-workshop' THEN 'Healthy cooking and nutrition'
  WHEN 'special-event-workshop' THEN 'Personalized celebration experience'
  WHEN 'business-wellness-workshop' THEN 'Workplace wellness and team building'
  ELSE theme
END
WHERE theme IS NULL;
