// Понятные объяснения: что значит ставка, что значит исход, описание матча.
// Всё считается из данных матча, без запросов к серверу.
import type { EventFull, EventSummary, Market, Outcome, SportId, Team } from '../types';
import { dayLabel, plural, SPORT_NAMES, time } from './format';

type Ev = Pick<EventSummary, 'sport' | 'home' | 'away'>;

/** Чем считают счёт в каждом виде спорта: [1, 2–4, 5+] */
const UNIT: Record<SportId, [string, string, string]> = {
  football: ['гол', 'гола', 'голов'],
  hockey: ['шайба', 'шайбы', 'шайб'],
  basketball: ['очко', 'очка', 'очков'],
  tennis: ['сет', 'сета', 'сетов'],
  volleyball: ['партия', 'партии', 'партий'],
  cs2: ['карта', 'карты', 'карт'],
  dota2: ['карта', 'карты', 'карт'],
  mma: ['раунд', 'раунда', 'раундов'],
};
const u = (sport: SportId, n: number) => plural(n, ...UNIT[sport]);

const num = (x: number) => String(x).replace('.', ',');
const lineOf = (key: string) => Number(key.split(':').pop());
const isQuarter = (l: number) => Math.abs((l * 4) % 2) === 1; // 0.25 / 0.75
const isWhole = (l: number) => Number.isInteger(l);

function overText(l: number, unitFn: (n: number) => string) {
  if (isQuarter(l)) return `больше ${num(l)} — азиатская линия: возможен возврат половины ставки`;
  if (isWhole(l)) return `${l + 1} ${unitFn(l + 1)} и больше; ровно ${l} — возврат ставки`;
  const n = Math.ceil(l);
  return `${n} ${unitFn(n)} и больше`;
}
function underText(l: number, unitFn: (n: number) => string) {
  if (isQuarter(l)) return `меньше ${num(l)} — азиатская линия: возможен возврат половины ставки`;
  if (isWhole(l)) return `${l - 1} ${unitFn(l - 1)} или меньше; ровно ${l} — возврат ставки`;
  const n = Math.floor(l);
  return `${n} ${unitFn(n)} или меньше`;
}

/** Фора для команды t с линией l (l<0 — даём фору сопернику). */
function handicapText(t: Team, l: number, unitFn: (n: number) => string) {
  if (isQuarter(l)) return `${t.short} с форой ${l > 0 ? '+' : ''}${num(l)} — азиатская фора, возможен частичный возврат`;
  if (l === 0) return `${t.short} побеждает; при ничьей — возврат ставки`;
  if (l < 0) {
    const need = Math.floor(-l) + 1;
    return isWhole(l)
      ? `${t.short} выигрывает с разницей ${need} ${unitFn(need)} и больше; разница ровно ${-l} — возврат`
      : `${t.short} выигрывает с разницей ${need} ${unitFn(need)} и больше`;
  }
  const can = Math.ceil(l) - 1;
  return isWhole(l)
    ? l === 1
      ? `${t.short} выигрывает или играет вничью; проигрыш ровно на 1 — возврат`
      : `${t.short} не проигрывает больше чем на ${l - 1} ${unitFn(l - 1)}; проигрыш ровно на ${l} — возврат`
    : can === 0
      ? `${t.short} выигрывает или играет вничью`
      : `${t.short} выигрывает, играет вничью или проигрывает не больше чем на ${can} ${unitFn(can)}`;
}

const WINNER_KEYS = new Set(['1x2', 'ml', 'reg1x2', 'dnb']);

/** Подпись исхода на кнопке в простом режиме: «Бетис», «Ничья», «Реал». */
export function shortOutcome(m: Pick<Market, 'key'>, o: Outcome, ev: Ev): string {
  const k = m.key.split(':').pop()!;
  if (WINNER_KEYS.has(m.key) || k === 'ml' || k === '1x2' || /^(set|map):\d+$/.test(m.key)) {
    if (o.key === '1') return ev.home.name;
    if (o.key === '2') return ev.away.name;
    if (o.key === 'X') return 'Ничья';
  }
  return o.label;
}

/** Исход простыми словами: что должно произойти, чтобы ставка сыграла. */
export function humanOutcome(m: Pick<Market, 'key' | 'title'>, o: Outcome, ev: Ev): string {
  const { home, away, sport } = ev;
  const key = m.key;
  const unitFn = (n: number) => u(sport, n);
  const pointsFn = (n: number) => plural(n, 'очко', 'очка', 'очков');
  const team = o.key === '1' ? home : o.key === '2' ? away : null;

  // кто победит
  if (key === '1x2' || key === 'reg1x2' || key.endsWith(':1x2')) {
    const scope = key === '1x2' && sport !== 'football' ? ' в основное время' : key === 'reg1x2' ? ' в основное время' : key.startsWith('p1') ? (sport === 'football' ? ' в 1-м тайме' : ' в 1-м периоде') : key.startsWith('h1') ? ' в 1-й половине' : '';
    if (o.key === 'X') return `Ничья${scope}`;
    return `Победит ${team!.name}${scope}`;
  }
  if (key === 'ml' || key.endsWith(':ml')) {
    if (key.startsWith('h1')) return `${team!.name} выиграет 1-ю половину`;
    const extra = sport === 'hockey' ? ' (с учётом овертайма и буллитов)' : sport === 'basketball' ? ' (с учётом овертайма)' : '';
    return `Победит ${team!.name}${extra}`;
  }
  if (/^(set|map):\d+$/.test(key)) {
    const n = key.split(':')[1];
    const what = key.startsWith('set') ? (sport === 'volleyball' ? `${n}-ю партию` : `${n}-й сет`) : `${n}-ю карту`;
    return `${team!.name} выиграет ${what}`;
  }
  if (key === 'dnb') return `Победит ${team!.name}; при ничьей — возврат ставки`;
  if (key === 'dc') return o.key === '1X' ? `${home.short} не проиграет (победа или ничья)` : o.key === 'X2' ? `${away.short} не проиграет (победа или ничья)` : 'Кто-то победит, ничьей не будет';
  if (key === 'btts') return o.key === 'yes' ? `Обе команды забьют хотя бы по ${sport === 'hockey' ? 'шайбе' : 'голу'}` : 'Хотя бы одна команда не забьёт';
  if (key === 'oddeven') return o.key === 'even' ? 'Сумма счёта будет чётной (0 считается чётным)' : 'Сумма счёта будет нечётной';
  if (key === 'distance') return o.key === 'yes' ? 'Бой продлится все раунды, победу отдадут судьи' : 'Бой закончится досрочно: нокаут или сабмишн';
  if (key === 'method') return o.key === 'ko' ? 'Бой закончится нокаутом' : o.key === 'sub' ? 'Бой закончится сабмишном (болевой или удушающий)' : 'Победителя определят судьи';
  if (key === 'cs' || key === 'score') return o.key === 'other' ? 'Любой другой счёт' : `Точный итоговый счёт ${o.label}`;

  // тоталы
  const totalOf = (who: string, unit: (n: number) => string) => {
    const l = lineOf(key);
    return o.key === 'over' ? `${who}: ${overText(l, unit)}` : `${who}: ${underText(l, unit)}`;
  };
  if (/^total:/.test(key)) return totalOf(sport === 'basketball' ? 'Всего очков в матче' : `Всего ${u(sport, 5)} в матче`, sport === 'basketball' ? pointsFn : unitFn);
  if (/^it[12]:/.test(key)) return totalOf(`${key.startsWith('it1') ? home.short : away.short} ${sport === 'basketball' ? 'наберёт' : 'забьёт'}`, sport === 'basketball' ? pointsFn : unitFn);
  if (/^(p1|h1):total:/.test(key)) return totalOf(key.startsWith('p1') ? (sport === 'football' ? 'Голов в 1-м тайме' : 'Шайб в 1-м периоде') : 'Очков в 1-й половине', sport === 'basketball' ? pointsFn : unitFn);
  if (/^units:/.test(key)) return totalOf(`${SPORT_NAMES[sport]}: всего ${u(sport, 5)} в матче`, unitFn);
  if (/^games:/.test(key)) return totalOf('Всего геймов в матче', (n) => plural(n, 'гейм', 'гейма', 'геймов'));
  if (/^map:\d+:total:/.test(key)) return totalOf(`Раундов на ${key.split(':')[1]}-й карте`, (n) => plural(n, 'раунд', 'раунда', 'раундов'));
  if (/^map:\d+:kills:/.test(key)) return totalOf(`Убийств на ${key.split(':')[1]}-й карте`, (n) => plural(n, 'убийство', 'убийства', 'убийств'));
  if (/^rounds:/.test(key)) {
    const l = lineOf(key);
    return o.key === 'over' ? `Бой продлится дольше середины ${Math.ceil(l)}-го раунда` : `Бой закончится до середины ${Math.ceil(l)}-го раунда`;
  }

  // форы
  if (/^(hcp|uhcp):/.test(key) && team) {
    const l = lineOf(key) * (o.key === '1' ? 1 : -1);
    return handicapText(team, l, sport === 'basketball' ? pointsFn : unitFn);
  }
  if (key.startsWith('wm')) return o.label.replace('П1', home.short).replace('П2', away.short);
  return `${m.title}: ${o.label}`;
}

/** Что это за ставка — короткая справка к рынку. */
export function marketHelp(m: Pick<Market, 'key' | 'title'>, ev: Ev): string {
  const key = m.key;
  const s = ev.sport;
  if (key === '1x2') return s === 'football' ? 'Ставка на итог матча: П1 — победа хозяев, Х — ничья, П2 — победа гостей. Считается основное время с добавленными минутами.' : 'Ставка на итог основного времени: П1 — победа хозяев, Х — ничья, П2 — победа гостей. Овертайм не учитывается.';
  if (key === 'ml') return s === 'hockey' ? 'Кто победит в итоге, с учётом овертайма и буллитов. Ничьей нет.' : s === 'basketball' ? 'Кто победит в итоге, с учётом овертайма. Ничьей нет.' : 'Кто победит в итоге. Ничьей нет.';
  if (key === 'reg1x2') return 'Исход основного времени, без овертайма. Здесь возможна ничья.';
  if (key === 'dc') return 'Двойной шанс: ставка сразу на два исхода из трёх. 1Х — хозяева не проиграют, Х2 — гости не проиграют, 12 — не будет ничьей. Коэффициент ниже, зато шансов больше.';
  if (key === 'dnb') return 'Ставка на победу команды, но если будет ничья — деньги вернутся.';
  if (key === 'btts') return 'Забьют ли обе команды хотя бы по разу. Счёт не важен — важно, чтобы обе отличились.';
  if (key === 'oddeven') return 'Будет ли сумма счёта чётной или нечётной. Например, 2:1 — нечёт, 1:1 — чёт.';
  if (/^total:|^units:|^games:|:total:|:kills:/.test(key)) return 'Тотал — ставка на количество. «Б 2,5» (больше) сыграет, если будет 3 и больше, «М 2,5» (меньше) — если 2 и меньше. Победитель не важен.';
  if (/^it[12]:/.test(key)) return 'Индивидуальный тотал — сколько забьёт одна конкретная команда. «Б» — больше линии, «М» — меньше.';
  if (/^(hcp|uhcp):/.test(key)) return 'Фора — к счёту команды мысленно прибавляют число в скобках. Ф1 (−1,5): хозяевам нужно выиграть с разницей 2+. Ф2 (+1,5): гостям достаточно не проиграть больше чем на 1. Если после форы получается ничья — возврат.';
  if (key === 'cs' || key === 'score') return 'Точный счёт — нужно угадать итоговый счёт полностью. Угадать сложно, поэтому коэффициенты высокие.';
  if (key === 'method') return 'Как закончится бой: нокаутом, сабмишном (болевой или удушающий приём) или решением судей.';
  if (key === 'distance') return 'Дойдёт ли бой до конца всех раундов. «Да» — победителя выберут судьи.';
  if (key.startsWith('wm')) return 'Нужно угадать и победителя, и то, как он победит.';
  if (key.startsWith('rounds')) return 'Сколько продлится бой. «Б 1,5» — бой продлится дольше середины 2-го раунда.';
  if (/^(set|map):\d+$/.test(key)) return 'Кто выиграет конкретную часть матча. Если она не будет сыграна — возврат.';
  if (key.startsWith('p1') || key.startsWith('h1')) return 'Ставка только на первую часть матча, остальное не учитывается.';
  return '';
}

/** Шанс исхода в процентах по коэффициентам (без маржи). */
export function chances(m: Market): Record<string, number> {
  const open = m.outcomes.filter((o) => o.odds);
  const inv = open.reduce((a, o) => a + 1 / o.odds!, 0);
  const res: Record<string, number> = {};
  for (const o of open) res[o.key] = Math.round(((1 / o.odds!) / inv) * 100);
  return res;
}

/** Основной рынок «кто победит» для простого режима. */
export function winnerMarket(ev: EventFull): Market | undefined {
  const prefer = ev.sport === 'football' ? ['1x2'] : ['ml', '1x2', 'reg1x2'];
  for (const k of prefer) {
    const m = ev.markets.find((x) => x.key === k);
    if (m) return m;
  }
}

/** Тотал с самой ровной линией (шансы ближе к 50/50). */
export function balancedTotal(ev: EventFull): Market | undefined {
  const re = ev.sport === 'tennis' ? /^games:/ : ev.sport === 'cs2' || ev.sport === 'dota2' || ev.sport === 'volleyball' ? /^units:/ : ev.sport === 'mma' ? /^$/ : /^total:/;
  let best: Market | undefined;
  let bestD = Infinity;
  for (const m of ev.markets) {
    if (!re.test(m.key)) continue;
    const [a, b] = m.outcomes;
    if (!a?.odds || !b?.odds) continue;
    const d = Math.abs(a.odds - b.odds);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/** Описание матча: несколько коротких абзацев. */
export function describeEvent(ev: EventFull): string[] {
  const { home, away, sport } = ev;
  const out: string[] = [];
  const individual = sport === 'tennis' || sport === 'mma';
  const vs = individual ? `${home.name} против ${away.name}` : `${home.name} принимает ${away.name}`;
  const wm = winnerMarket(ev);
  const ch = wm ? chances(wm) : {};
  const fav = ch['1'] !== undefined && ch['2'] !== undefined ? (ch['1'] >= ch['2'] ? home : away) : null;
  const favCh = fav ? (fav === home ? ch['1'] : ch['2']) : 0;

  if (ev.status === 'scheduled') {
    out.push(`${ev.league.name}. ${vs}. Начало ${dayLabel(ev.startAt).toLowerCase()} в ${time(ev.startAt)}.`);
    if (fav) {
      const gap = Math.abs((ch['1'] ?? 0) - (ch['2'] ?? 0));
      const draw = ch['X'] ? ` Ничья — около ${ch['X']}%.` : '';
      out.push(gap < 10 ? `Силы примерно равны: шансы ${home.short} — ${ch['1']}%, ${away.short} — ${ch['2']}%.${draw}` : `Фаворит — ${fav.name}: шанс победы около ${favCh}%.${draw}`);
    }
  } else if (ev.status === 'live') {
    const [a, b] = ev.sb.score;
    const lead = a === b ? (a === 0 ? 'Пока 0:0.' : `Ничья ${a}:${b}.`) : `${a > b ? home.name : away.name} ${individual || sport === 'cs2' || sport === 'dota2' || sport === 'volleyball' ? 'впереди' : 'ведёт'} ${Math.max(a, b)}:${Math.min(a, b)}.`;
    out.push(`Идёт матч: ${ev.sb.period.toLowerCase()}${ev.sb.clock ? `, ${ev.sb.clock}` : ''}. ${lead}`);
    if (fav) out.push(`Сейчас шансы на победу: ${home.short} — ${ch['1']}%${ch['X'] ? `, ничья — ${ch['X']}%` : ''}, ${away.short} — ${ch['2']}%. Коэффициенты меняются по ходу игры.`);
  } else {
    out.push(`Матч завершён со счётом ${ev.sb.score[0]}:${ev.sb.score[1]}.`);
  }

  const total = balancedTotal(ev);
  if (total && ev.status !== 'finished') {
    const l = lineOf(total.key);
    const what = sport === 'basketball' ? 'очков' : sport === 'tennis' ? 'геймов' : u(sport, 5);
    out.push(`Ожидается около ${num(l)} ${what} за матч — это средняя линия тотала.`);
  }

  const RULES: Record<SportId, string> = {
    football: 'Матч — два тайма по 45 минут. Ставки на исход считаются по основному времени с добавленными минутами.',
    hockey: 'Три периода по 20 минут. «Исход» — только основное время, «Победитель» — с овертаймом и буллитами.',
    basketball: 'Четыре четверти. Ничьей не бывает: при равенстве играют овертайм, и он учитывается в ставках «вкл. ОТ».',
    tennis: 'Матч до двух выигранных сетов. Если игрок снимется, ставки на незавершённые части матча вернутся.',
    volleyball: 'Матч до трёх выигранных партий. Ничьей не бывает.',
    cs2: 'Серия до двух побед на картах. Ничьей не бывает.',
    dota2: 'Серия до двух побед на картах. Ничьей не бывает.',
    mma: 'Бой из трёх раундов по 5 минут. Может закончиться досрочно — нокаутом или сабмишном — или решением судей.',
  };
  out.push(RULES[sport]);
  return out;
}

/** Сколько вернётся при выигрыше со ставки 100. */
export const winFor = (odds: number, stake = 100) => Math.floor(stake * odds);

export { u as unitWord };
