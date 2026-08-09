ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_type varchar(30) NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN IF NOT EXISTS company_name varchar(200),
  ADD COLUMN IF NOT EXISTS business_id varchar(100);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_type_check;
ALTER TABLE users ADD CONSTRAINT users_account_type_check
  CHECK (account_type IN ('INDIVIDUAL', 'COMPANY'));
