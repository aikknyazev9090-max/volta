import { CURRENCY } from '../config.js';
import { q, tx } from '../db.js';

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400, public extra?: any) {
    super(message);
  }
}

export type LedgerType =
  | 'welcome'
  | 'bonus'
  | 'refill'
  | 'referral'
  | 'bet_stake'
  | 'bet_win'
  | 'cashout'
  | 'admin_adjust';

export function getBalance(userId: number, currency = CURRENCY): number {
  return q.get<{ balance: number }>('SELECT balance FROM wallets WHERE user_id = ? AND currency = ?', userId, currency)?.balance ?? 0;
}

/** Движение по кошельку (в минимальных единицах). Отрицательная сумма — списание. */
export function move(userId: number, amount: number, type: LedgerType, opts: { betId?: number; note?: string; currency?: string } = {}): number {
  if (!Number.isInteger(amount)) throw new Error('Сумма должна быть целой');
  const currency = opts.currency ?? CURRENCY;
  return tx(() => {
    q.run('INSERT OR IGNORE INTO wallets(user_id, currency, balance) VALUES(?, ?, 0)', userId, currency);
    const r = q.run('UPDATE wallets SET balance = balance + ? WHERE user_id = ? AND currency = ? AND balance + ? >= 0', amount, userId, currency, amount);
    if (Number(r.changes) === 0) throw new AppError('insufficient', 'Недостаточно монет на балансе');
    const bal = getBalance(userId, currency);
    q.run(
      'INSERT INTO ledger(user_id, currency, type, amount, balance_after, bet_id, note, created_at) VALUES(?,?,?,?,?,?,?,?)',
      userId, currency, type, amount, bal, opts.betId ?? null, opts.note ?? null, Date.now(),
    );
    return bal;
  });
}

/** Сверка: баланс кошелька = сумма журнала. */
export function auditWallet(userId: number, currency = CURRENCY) {
  const sum = q.get<{ s: number }>('SELECT COALESCE(SUM(amount),0) AS s FROM ledger WHERE user_id = ? AND currency = ?', userId, currency)!.s;
  const bal = getBalance(userId, currency);
  return { ok: sum === bal, ledger: sum, balance: bal };
}

/**
 * Задел под реальные деньги: платёжный провайдер.
 * В демо не используется — REAL_MONEY_ENABLED=false запрещает запуск с реальными деньгами.
 */
export interface PaymentProvider {
  deposit(userId: number, amount: number, currency: string): Promise<{ redirectUrl: string }>;
  withdraw(userId: number, amount: number, currency: string): Promise<{ id: string }>;
}
