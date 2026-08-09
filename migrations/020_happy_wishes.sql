CREATE TABLE IF NOT EXISTS happy_wishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(180) NOT NULL,
  wish_type varchar(30) NOT NULL,
  description text NOT NULL,
  target_date date,
  importance smallint NOT NULL,
  first_step varchar(500) NOT NULL,
  momentum_score smallint NOT NULL,
  guidance varchar(500) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT happy_wishes_type_check CHECK (wish_type IN ('DREAM','BIRTHDAY','WELLNESS','FAMILY','EXPERIENCE','OTHER')),
  CONSTRAINT happy_wishes_importance_check CHECK (importance BETWEEN 1 AND 5),
  CONSTRAINT happy_wishes_score_check CHECK (momentum_score BETWEEN 0 AND 100),
  CONSTRAINT happy_wishes_status_check CHECK (status IN ('ACTIVE','ACHIEVED','PAUSED'))
);

CREATE INDEX IF NOT EXISTS happy_wishes_user_id_idx
  ON happy_wishes(user_id, created_at DESC);
