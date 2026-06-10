-- Bolão Copa do Mundo 2026 - Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(500),
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Groups (bolões)
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(8) UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group members
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- Matches
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_number INTEGER NOT NULL,
  home_team VARCHAR(100) NOT NULL,
  away_team VARCHAR(100) NOT NULL,
  home_team_flag VARCHAR(10) NOT NULL,
  away_team_flag VARCHAR(10) NOT NULL,
  match_date TIMESTAMPTZ NOT NULL,
  stage VARCHAR(50) NOT NULL,
  group_name VARCHAR(10),
  venue VARCHAR(200) NOT NULL,
  city VARCHAR(100) NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Predictions (palpites)
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  points INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, match_id, group_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_group ON predictions(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

-- Function to calculate points
CREATE OR REPLACE FUNCTION calculate_points(
  pred_home INTEGER, pred_away INTEGER,
  real_home INTEGER, real_away INTEGER
) RETURNS INTEGER AS $$
DECLARE
  pred_result VARCHAR(1);
  real_result VARCHAR(1);
BEGIN
  IF real_home IS NULL OR real_away IS NULL THEN
    RETURN NULL;
  END IF;

  -- Exact score: 3 points
  IF pred_home = real_home AND pred_away = real_away THEN
    RETURN 3;
  END IF;

  -- Determine results
  IF pred_home > pred_away THEN pred_result := 'H';
  ELSIF pred_home < pred_away THEN pred_result := 'A';
  ELSE pred_result := 'D';
  END IF;

  IF real_home > real_away THEN real_result := 'H';
  ELSIF real_home < real_away THEN real_result := 'A';
  ELSE real_result := 'D';
  END IF;

  -- Correct draw (not exact): 2 points
  IF pred_result = 'D' AND real_result = 'D' THEN
    RETURN 2;
  END IF;

  -- Correct winner: 1 point
  IF pred_result = real_result THEN
    RETURN 1;
  END IF;

  RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate points when match result is inserted/updated
CREATE OR REPLACE FUNCTION update_prediction_points()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL THEN
    UPDATE predictions
    SET points = calculate_points(home_score, away_score, NEW.home_score, NEW.away_score),
        updated_at = NOW()
    WHERE match_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_points ON matches;
CREATE TRIGGER trigger_update_points
  AFTER INSERT OR UPDATE OF home_score, away_score ON matches
  FOR EACH ROW EXECUTE FUNCTION update_prediction_points();
