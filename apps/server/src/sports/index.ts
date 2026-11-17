import { basketball } from './basketball.js';
import { football, hockey } from './goal.js';
import { mma } from './mma.js';
import { cs2, dota2, tennis, volleyball } from './series.js';
import type { SportId, SportModule } from './types.js';

export const SPORTS: Record<SportId, SportModule> = {
  football,
  hockey,
  basketball,
  tennis,
  cs2,
  dota2,
  volleyball,
  mma,
};

export const SPORT_ORDER: SportId[] = ['football', 'hockey', 'basketball', 'tennis', 'cs2', 'dota2', 'mma', 'volleyball'];

export * from './types.js';
