UPDATE family_members
SET wellness_notes = 'No wellness notes provided'
WHERE wellness_notes IS NULL OR btrim(wellness_notes) = '';

ALTER TABLE family_members
  ALTER COLUMN wellness_notes SET NOT NULL;

ALTER TABLE family_members DROP CONSTRAINT IF EXISTS family_members_wellness_notes_check;
ALTER TABLE family_members ADD CONSTRAINT family_members_wellness_notes_check
  CHECK (btrim(wellness_notes) <> '');
