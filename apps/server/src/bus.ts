import { EventEmitter } from 'node:events';

/** Внутренняя шина событий между модулями (лайв → WS, расчёт → бот). */
export const bus = new EventEmitter();
bus.setMaxListeners(100);

export interface UserNotice {
  userId: number;
  tgId: number;
  kind: 'bet_settled' | 'achievement' | 'balance';
  payload: any;
}
