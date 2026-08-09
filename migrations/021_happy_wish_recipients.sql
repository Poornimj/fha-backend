ALTER TABLE happy_wishes
  ADD COLUMN IF NOT EXISTS recipient_type varchar(30) NOT NULL DEFAULT 'MYSELF',
  ADD COLUMN IF NOT EXISTS recipient_name varchar(160);

ALTER TABLE happy_wishes DROP CONSTRAINT IF EXISTS happy_wishes_recipient_type_check;
ALTER TABLE happy_wishes ADD CONSTRAINT happy_wishes_recipient_type_check
  CHECK (recipient_type IN ('MYSELF','PARTNER','FRIEND','CHILD','PARENT','FAMILY','SOMEONE_SPECIAL'));
