SET search_path TO public;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS knowledge_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'reviewing', 'answered', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_questions_user_id_idx
  ON knowledge_questions(user_id);
CREATE INDEX IF NOT EXISTS knowledge_questions_status_idx
  ON knowledge_questions(status);

DROP TRIGGER IF EXISTS knowledge_questions_set_updated_at ON knowledge_questions;
CREATE TRIGGER knowledge_questions_set_updated_at
BEFORE UPDATE ON knowledge_questions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS knowledge_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES knowledge_questions(id) ON DELETE CASCADE,
  answered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  answer TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_answers_question_id_idx
  ON knowledge_answers(question_id);

DROP TRIGGER IF EXISTS knowledge_answers_set_updated_at ON knowledge_answers;
CREATE TRIGGER knowledge_answers_set_updated_at
BEFORE UPDATE ON knowledge_answers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS personalized_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID REFERENCES knowledge_questions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  safety_notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(ingredients) = 'array')
);

CREATE INDEX IF NOT EXISTS personalized_recipes_user_id_idx
  ON personalized_recipes(user_id);

DROP TRIGGER IF EXISTS personalized_recipes_set_updated_at ON personalized_recipes;
CREATE TRIGGER personalized_recipes_set_updated_at
BEFORE UPDATE ON personalized_recipes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_status_history_order_id_idx
  ON order_status_history(order_id, created_at DESC);
