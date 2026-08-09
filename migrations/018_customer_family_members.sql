ALTER TABLE users
  ADD COLUMN IF NOT EXISTS date_of_birth date;

CREATE TABLE IF NOT EXISTS family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name varchar(120) NOT NULL,
  family_name varchar(120) NOT NULL,
  relationship varchar(80) NOT NULL,
  date_of_birth date NOT NULL,
  wellness_notes text,
  guardian_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_members_birth_date_check CHECK (date_of_birth <= CURRENT_DATE)
);

CREATE INDEX IF NOT EXISTS family_members_user_id_idx
  ON family_members(user_id, created_at);
