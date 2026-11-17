export type SportId = 'football' | 'hockey' | 'basketball' | 'tennis' | 'cs2' | 'dota2' | 'volleyball' | 'mma';
export type Settle = 'win' | 'lose' | 'void' | 'half_win' | 'half_lose';

export interface Team {
  id: string;
  name: string;
  short: string;
  colors: [string, string];
  rating: number;
}

export interface Outcome {
  key: string;
  label: string;
  odds: number | null;
}
export interface Market {
  key: string;
  title: string;
  group: 'main' | 'totals' | 'handicap' | 'period' | 'score' | 'other';
  layout?: 'row' | 'grid';
  outcomes: Outcome[];
}

export interface Scoreboard {
  score: [number, number];
  clock: string;
  period: string;
  detail?: string;
  serving?: 0 | 1;
  pressure?: number;
  isBreak?: boolean;
}

export interface EventSummary {
  id: string;
  sport: SportId;
  league: { id: string; name: string; country: string };
  home: Team;
  away: Team;
  startAt: number;
  status: 'scheduled' | 'live' | 'finished' | 'cancelled';
  top: boolean;
  suspended: boolean;
  sb: Scoreboard;
  main: Market | null;
  marketsCount: number;
  /** Настоящий матч из расписания: ставки только до начала, расчёт по итоговому счёту. */
  real?: boolean;
}

export interface Incident {
  type: 'goal' | 'period' | 'start' | 'finish' | 'point' | 'card' | 'info';
  side?: 0 | 1;
  text: string;
  clock?: string;
  at?: number;
}

export interface EventFull extends EventSummary {
  stats: { label: string; h: number; a: number }[];
  markets: Market[];
  incidents: Incident[];
}

export interface UserSettings {
  oddsFormat: 'decimal' | 'fractional' | 'american';
  acceptChanges: 'any' | 'up' | 'none';
  notifications: boolean;
  sound: boolean;
  haptics: boolean;
  quickStakes: number[];
}

export interface BonusStatus {
  available: boolean;
  streak: number;
  nextDay: number;
  nextAmount: number;
  ladder: number[];
  nextAt: number;
}

export interface Me {
  id: number;
  tgId: number;
  name: string;
  username: string | null;
  photo: string | null;
  lang: string;
  onboarded: boolean;
  settings: UserSettings;
  balance: number;
  currency: string;
  isAdmin: boolean;
  createdAt: number;
  bonus: BonusStatus;
  refill: { available: boolean; nextAt: number; amount: number; eligible: boolean };
  favorites: string[];
}

export interface BetSelection {
  eventId: string;
  sport: SportId;
  eventName: string;
  market: string;
  marketTitle: string;
  outcome: string;
  label: string;
  odds: number;
  result: Settle | null;
  event: null | { status: EventSummary['status']; startAt: number; score: [number, number]; clock: string; home: Team; away: Team };
}

export interface Bet {
  id: number;
  type: 'single' | 'express';
  stake: number;
  odds: number;
  potential: number;
  status: 'pending' | 'won' | 'lost' | 'void' | 'cashed_out';
  payout: number;
  live: boolean;
  createdAt: number;
  settledAt: number | null;
  selections: BetSelection[];
}

export interface Achievement {
  code: string;
  title: string;
  desc: string;
  icon: string;
  unlockedAt: number | null;
}

export interface Profile {
  stats: {
    total: number;
    settled: number;
    won: number;
    lost: number;
    winRate: number;
    profit: number;
    roi: number;
    biggestWin: number;
    maxOdds: number;
    favoriteSport: SportId | null;
  };
  achievements: Achievement[];
  referral: { code: string; invited: number; bonus: number };
}

export interface LeaderRow {
  rank: number;
  userId: number;
  name: string;
  photo: string | null;
  profit: number;
  bets: number;
  winRate: number;
  me: boolean;
}
