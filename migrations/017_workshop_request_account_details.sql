ALTER TABLE workshop_requests
  ADD COLUMN IF NOT EXISTS company_name varchar(200),
  ADD COLUMN IF NOT EXISTS requester_address text;
