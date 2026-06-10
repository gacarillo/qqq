export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  code: string;
  owner_id: string;
  owner_name: string;
  description?: string;
  member_count: number;
  created_at: string;
  members?: GroupMember[];
}

export interface GroupMember {
  id: string;
  name: string;
  email: string;
  joined_at: string;
}

export interface Match {
  id: string;
  match_number: number;
  home_team: string;
  away_team: string;
  home_team_flag: string;
  away_team_flag: string;
  match_date: string;
  stage: string;
  group_name?: string;
  venue: string;
  city: string;
  home_score?: number;
  away_score?: number;
  status: 'scheduled' | 'live' | 'finished';
}

export interface Prediction {
  id: string;
  user_id: string;
  match_id: string;
  group_id: string;
  home_score: number;
  away_score: number;
  points?: number;
  created_at: string;
  updated_at: string;
  user_name?: string;
  match_home_score?: number;
  match_away_score?: number;
  match_status?: string;
  match_date?: string;
  // Joined from match
  home_team?: string;
  away_team?: string;
  home_team_flag?: string;
  away_team_flag?: string;
  stage?: string;
  group_name?: string;
  venue?: string;
  city?: string;
  match_number?: number;
}

export interface RankingEntry {
  user_id: string;
  user_name: string;
  total_points: number;
  exact_scores: number;
  correct_draws: number;
  correct_winners: number;
  scored_predictions: number;
  total_predictions: number;
  position: number;
}
