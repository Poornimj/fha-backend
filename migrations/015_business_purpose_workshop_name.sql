UPDATE workshops
SET title = 'Business Purpose Workshop',
    slug = 'business-purpose-workshop',
    updated_at = now()
WHERE title = 'Business Wellness Workshop'
   OR slug = 'business-wellness-workshop';
