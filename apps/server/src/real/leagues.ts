// Турниры football-data.org, доступные на бесплатном тарифе, с русскими названиями.
export interface RealLeague {
  code: string;
  id: string;
  name: string;
  country: string;
  /** Насколько матчи турнира интересны: влияет на пометку «топ». */
  prestige: number;
}

export const REAL_LEAGUES: RealLeague[] = [
  { code: 'CL', id: 'real-CL', name: 'Лига чемпионов', country: 'eu', prestige: 3 },
  { code: 'PL', id: 'real-PL', name: 'Англия. Премьер-лига', country: 'gb', prestige: 3 },
  { code: 'PD', id: 'real-PD', name: 'Испания. Ла Лига', country: 'es', prestige: 2 },
  { code: 'SA', id: 'real-SA', name: 'Италия. Серия A', country: 'it', prestige: 2 },
  { code: 'BL1', id: 'real-BL1', name: 'Германия. Бундеслига', country: 'de', prestige: 2 },
  { code: 'FL1', id: 'real-FL1', name: 'Франция. Лига 1', country: 'fr', prestige: 1 },
  { code: 'DED', id: 'real-DED', name: 'Нидерланды. Эредивизи', country: 'nl', prestige: 1 },
  { code: 'PPL', id: 'real-PPL', name: 'Португалия. Примейра', country: 'pt', prestige: 1 },
];

export const realLeagueById = new Map(REAL_LEAGUES.map((l) => [l.id, l]));
export const realLeagueByCode = new Map(REAL_LEAGUES.map((l) => [l.code, l]));
