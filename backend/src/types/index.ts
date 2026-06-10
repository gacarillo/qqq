export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  avatar_url?: string;
  created_at: Date;
}

export interface Group {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  description?: string;
  created_at: Date;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  joined_at: Date;
  user_name?: string;
  user_email?: string;
}

export interface Match {
  id: string;
  home_team: string;
  away_team: string;
  home_team_flag: string;
  away_team_flag: string;
  match_date: Date;
  stage: string;
  group_name?: string;
  venue: string;
  city: string;
  home_score?: number;
  away_score?: number;
  status: 'scheduled' | 'live' | 'finished';
  match_number: number;
}

export interface Prediction {
  id: string;
  user_id: string;
  match_id: string;
  group_id: string;
  home_score: number;
  away_score: number;
  points?: number;
  created_at: Date;
  updated_at: Date;
}

export interface RankingEntry {
  user_id: string;
  user_name: string;
  total_points: number;
  exact_scores: number;
  correct_winners: number;
  total_predictions: number;
  position: number;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
