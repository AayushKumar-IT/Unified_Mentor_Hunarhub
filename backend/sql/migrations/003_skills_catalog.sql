CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (category_id, slug)
);

CREATE TABLE IF NOT EXISTS entrepreneur_skills (
  entrepreneur_id UUID NOT NULL REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id),
  PRIMARY KEY (entrepreneur_id, skill_id)
);

CREATE INDEX IF NOT EXISTS skills_category_active_idx
  ON skills (category_id, active, name);
CREATE INDEX IF NOT EXISTS entrepreneur_skills_skill_idx
  ON entrepreneur_skills (skill_id, entrepreneur_id);

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
