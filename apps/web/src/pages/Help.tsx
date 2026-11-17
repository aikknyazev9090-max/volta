import clsx from 'clsx';
import { ChevronDown, Coins, Gift, Layers, Radio, Ticket, Wallet, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Chrome';
import { BetModeSwitch } from '../components/SimpleBets';
import { Button } from '../components/ui';
import { haptic } from '../lib/tg';

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-2.5 flex items-center gap-2 text-[16px] font-extrabold">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent/15 text-accent">{icon}</span>
        {title}
      </h2>
      <div className="space-y-2 text-[13.5px] leading-relaxed text-ink/85">{children}</div>
    </section>
  );
}

/** Нарисованная кнопка коэффициента для примеров (не нажимается). */
function FakeOdds({ label, odds, active }: { label: string; odds: string; active?: boolean }) {
  return (
    <div className={clsx('flex h-[50px] flex-1 flex-col items-center justify-center rounded-[13px]', active ? 'bg-accent text-accentInk' : 'bg-surface2')}>
      <span className={clsx('text-[11.5px] font-semibold', active ? 'text-accentInk/70' : 'text-muted')}>{label}</span>
      <span className="num text-[15px] font-extrabold">{odds}</span>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-extrabold text-accentInk">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[14px] font-extrabold">{title}</div>
        {children && <div className="mt-1 text-[13px] leading-relaxed text-muted">{children}</div>}
      </div>
    </div>
  );
}

const TERMS: [string, string][] = [
  ['П1 / П2', 'Победа первой (хозяев) или второй (гостей) команды.'],
  ['Х', 'Ничья.'],
  ['1Х, Х2, 12', 'Двойной шанс: ставка сразу на два исхода. 1Х — первая команда не проиграет.'],
  ['Тотал Б 2,5', 'Больше 2,5: будет 3 гола (очка, сета…) и больше. Кто победит — не важно.'],
  ['Тотал М 2,5', 'Меньше 2,5: будет 2 и меньше.'],
  ['Фора Ф1 (−1,5)', 'Первой команде нужно выиграть с разницей 2 и больше.'],
  ['Фора Ф2 (+1,5)', 'Второй команде достаточно не проиграть больше чем на 1.'],
  ['Обе забьют', 'Каждая команда забьёт хотя бы по разу.'],
  ['Точный счёт', 'Нужно угадать итоговый счёт полностью. Сложно, зато коэффициенты высокие.'],
  ['Возврат', 'Ставка не сыграла и не проиграла — монеты вернутся. Бывает на целых линиях: например, тотал Б 2 при счёте 1:1.'],
  ['Реальный матч', 'Настоящий матч из расписания лиги. Ставки — до стартового свистка, расчёт по итоговому счёту.'],
  ['Виртуальный матч', 'Матч разыгрывает компьютер. Идут круглосуточно, ставить можно и по ходу игры (в лайве).'],
  ['Выкуп', 'Можно продать ставку до конца матча и сразу получить часть монет — даже если она ещё не сыграла.'],
];

const FAQ: [string, string][] = [
  ['Это настоящие деньги?', 'Нет. VOLTA — демо-версия: монеты виртуальные, их нельзя купить, продать или вывести. Можно спокойно учиться и играть.'],
  ['Что делать, если монеты закончились?', 'Если на балансе меньше 10 монет, в профиле появится кнопка восстановления баланса — она доступна раз в сутки. А ещё каждый день есть бонус — значок подарка вверху.'],
  ['Когда рассчитают ставку на реальный матч?', 'Итоговый счёт приходит с задержкой — обычно в течение часа после финального свистка. Если матч перенесли или отменили, ставка вернётся.'],
  ['Почему коэффициент изменился, пока я выбирал?', 'В виртуальном лайве коэффициенты пересчитываются каждые несколько секунд. Если коэффициент изменился, купон покажет старое и новое значение — подтвердите ставку ещё раз.'],
  ['Почему кнопки с замком?', 'Ставки на паузе: в матче опасный момент или только что был гол. Через несколько секунд приём ставок возобновится.'],
  ['Где посмотреть, сыграла ли ставка?', 'В разделе «Ставки». Когда матч закончится, бот пришлёт уведомление с результатом.'],
  ['Можно ли поставить на два исхода одного матча?', 'Да, но только отдельными ставками (ординарами). В экспресс можно собрать исходы только из разных матчей.'],
];

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line last:border-0">
      <button onClick={() => { haptic.select(); setOpen(!open); }} className="flex w-full items-center gap-2 py-3 text-left text-[13.5px] font-bold">
        <span className="flex-1">{q}</span>
        <ChevronDown size={17} className={clsx('shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && <p className="pb-3 text-[13px] leading-relaxed text-muted">{a}</p>}
    </div>
  );
}

export default function Help() {
  const nav = useNavigate();
  return (
    <div className="pb-8">
      <Header title="Как делать ставки" right={<span />} />
      <div className="space-y-3 px-3 pt-3">
        <div className="rounded-[20px] border border-accent/25 bg-gradient-to-br from-accent/15 to-transparent p-4">
          <div className="font-display text-[19px] font-semibold leading-tight">Ставка — это прогноз на матч</div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink/85">Вы выбираете, что произойдёт: кто победит, сколько будет голов и т. п. Угадали — получаете ставку, умноженную на коэффициент. Не угадали — ставка сгорает. Все монеты виртуальные.</p>
        </div>

        <Section icon={<Ticket size={17} />} title="Как сделать ставку">
          <div className="space-y-3.5 pt-1">
            <Step n={1} title="Выберите матч">На главной — настоящие матчи, в разделе «Виртуальные» — матчи, которые разыгрывает компьютер. Нажмите на карточку матча, чтобы открыть все ставки и описание.</Step>
            <Step n={2} title="Нажмите на вариант">
              Например, на победу команды. Кнопка подсветится, а вариант попадёт в купон.
              <div className="mt-2.5 flex gap-1.5">
                <FakeOdds label="Бетис" odds="2.10" active />
                <FakeOdds label="Ничья" odds="3.40" />
                <FakeOdds label="Реал" odds="3.20" />
              </div>
            </Step>
            <Step n={3} title="Откройте купон">{'На телефоне — большая кнопка в центре нижнего меню, на компьютере купон всегда справа.'}</Step>
            <Step n={4} title="Введите сумму и нажмите «Поставить»">Купон сразу покажет возможный выигрыш. Результат придёт после матча — и в приложении, и в боте.</Step>
          </div>
        </Section>

        <Section icon={<Coins size={17} />} title="Что такое коэффициент">
          <p>Коэффициент показывает, во сколько раз умножится ставка, если вы угадаете.</p>
          <div className="rounded-xl bg-surface2 p-3 font-semibold">
            Ставка <span className="num font-extrabold">100</span> × коэффициент <span className="num font-extrabold">2.10</span> = выигрыш <span className="num font-extrabold text-up">210</span>
            <div className="mt-1 text-[12.5px] font-normal text-muted">Из них 100 — ваша ставка, 110 — прибыль.</div>
          </div>
          <p>Чем меньше коэффициент, тем вероятнее исход. 1.30 — почти наверняка, 5.00 — маловероятно, но выигрыш большой.</p>
        </Section>

        <Section icon={<Layers size={17} />} title="Простые и все ставки">
          <p>
            <b>Простые ставки</b> — только главное: кто победит и сколько будет голов, с подсказками простыми словами. Хороший старт. <b>Все ставки</b> — десятки вариантов: форы, тоталы, точный счёт. Около каждого есть «?» с объяснением.
          </p>
          <BetModeSwitch className="mt-1" />
        </Section>

        <Section icon={<Zap size={17} />} title="Ординар и экспресс">
          <p>
            <b>Ординар</b> — ставка на один исход. <b>Экспресс</b> — несколько исходов из разных матчей в одной ставке: коэффициенты перемножаются, но выиграть должны все.
          </p>
          <div className="rounded-xl bg-surface2 p-3 text-[13px]">
            Бетис победит <span className="num font-bold">2.10</span> × Тотал Б 2,5 в другом матче <span className="num font-bold">1.80</span> = <span className="num font-extrabold text-accent">3.78</span>
            <div className="mt-1 text-muted">Ставка 100 → выигрыш 378, если сыграют оба.</div>
          </div>
          <p>Если добавить в купон несколько исходов, вверху появится выбор: «Ординары» или «Экспресс».</p>
        </Section>

        <Section icon={<Radio size={17} />} title="Ставки в лайве">
          <p>Лайв есть только у виртуальных матчей — на настоящие ставки принимаются до начала. Во время виртуального матча коэффициенты меняются вместе со счётом. После гола или в опасный момент приём ставок встаёт на паузу на несколько секунд — кнопки показывают замок.</p>
        </Section>

        <Section icon={<Wallet size={17} />} title="Мои ставки и выкуп">
          <p>Все ставки — во вкладке «Ставки». Пока матч идёт, ставку можно продать досрочно (кнопка «Продать ставку»): получите часть монет сразу, не дожидаясь конца.</p>
        </Section>

        <Section icon={<Gift size={17} />} title="Бонусы">
          <p>Каждый день забирайте бонус — значок подарка вверху экрана. Чем дольше серия дней подряд, тем больше монет. За приглашённого друга — монеты вам обоим.</p>
        </Section>

        <section className="card p-4">
          <h2 className="mb-2 text-[16px] font-extrabold">Словарь</h2>
          <div className="divide-y divide-line">
            {TERMS.map(([t, d]) => (
              <div key={t} className="flex gap-3 py-2.5">
                <span className="w-[112px] shrink-0 text-[13px] font-extrabold">{t}</span>
                <span className="text-[13px] leading-snug text-muted">{d}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card px-4 py-2">
          <h2 className="pb-1 pt-2 text-[16px] font-extrabold">Частые вопросы</h2>
          {FAQ.map(([q, a]) => (
            <Faq key={q} q={q} a={a} />
          ))}
        </section>

        <Button size="lg" className="w-full" onClick={() => nav('/')}>
          Перейти к матчам
        </Button>
      </div>
    </div>
  );
}
