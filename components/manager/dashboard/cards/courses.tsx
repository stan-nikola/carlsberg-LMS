"use client";

import Link from "next/link";
import { ClockIcon, MedalIcon, TrendIcon, CourseIcon } from "@/components/ui/icons";
import { LinesSkeleton } from "@/components/ui/Skeleton";
import type { CourseFunnel } from "@/lib/teamInsights";
import { BarRow, ChartCard } from "@/components/manager/dashboard/ChartCard";
import type { Bucket, DashboardStats, HardestQuestionsState } from "@/components/manager/dashboard/types";

/** Бари міряються від найбільшої корзини, а не від суми: корзини взаємовиключні,
 *  і при 5 корзинах частка від суми зробила б усі бари однаково куцими. */
const maxCount = (buckets: Bucket[]) => Math.max(1, ...buckets.map((b) => b.count));
const totalCount = (buckets: Bucket[]) => buckets.reduce((sum, b) => sum + b.count, 0);

/**
 * Єдиний блок, що дивиться ВПЕРЕД — решта показників ретроспективні.
 * Рахуються лише незавершені призначення: у завершеного дедлайн уже не має
 * сенсу, вкладеність у нього міряє окремий показник "Вчасно".
 */
export function DeadlinesCard({ buckets, live }: { buckets: Bucket[]; live: boolean }) {
  const max = maxCount(buckets);
  return (
    <ChartCard
      icon={<ClockIcon />}
      title="Дедлайни на горизонті"
      hint="Незавершені призначення за тим, скільки лишилось до дедлайну. Завершені сюди не входять — у них дедлайн уже вирішено. Відповідає на питання «кому написати цього тижня», а не «що вже сталось»."
    >
      {totalCount(buckets) === 0 ? (
        <p className="admin-hint">Немає незавершених призначень.</p>
      ) : (
        <ul className="mgr-bar-list">
          {buckets.map((b) => (
            <BarRow
              key={b.key}
              href={`/manager/team?view=courses&due=${b.key}`}
              label={b.label}
              pct={live ? (b.count / max) * 100 : 0}
              alert={Boolean(b.alert) && b.count > 0}
              value={b.count}
            />
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

/**
 * Розкид за середнім балом: 86% — це може бути "вся команда рівно на 86" або
 * "половина на 100, половина ледь за порогом", і це різні управлінські ситуації.
 */
export function ScoreDistCard({ buckets, live }: { buckets: Bucket[]; live: boolean }) {
  const max = maxCount(buckets);
  return (
    <ChartCard
      icon={<MedalIcon />}
      title="Розподіл балів"
      hint="Скільки завершених курсів потрапило в кожен діапазон балу. Показує розкид, який ховається за одним середнім балом. Межі тут — просто рівні відрізки шкали, а не прохідний бал: він свій у кожного курсу."
    >
      {totalCount(buckets) === 0 ? (
        <p className="admin-hint">Немає завершених курсів із балом.</p>
      ) : (
        <ul className="mgr-bar-list">
          {buckets.map((b) => (
            <BarRow key={b.key} href={`/manager/team?view=courses&score=${b.key}`} label={b.label} pct={live ? (b.count / max) * 100 : 0} value={b.count} />
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

/**
 * Скільки людей РЕАЛЬНО склали курс (passed, кожен модуль ≥ прохідного балу),
 * а не просто дійшли до кінця — інакше курс без жодного складеного показував
 * би оманливі 100%. Під смугою — воронка курсу, кожна цифра веде на список.
 */
export function CourseBreakdownCard({
  courses,
  funnels,
  live,
}: {
  courses: DashboardStats["courseBreakdown"];
  funnels: CourseFunnel[] | undefined;
  live: boolean;
}) {
  const funnelByCourseId = new Map((funnels || []).map((f) => [f.id, f]));
  return (
    <ChartCard
      icon={<TrendIcon />}
      title="% складання по курсу"
      hint="Скільки людей РЕАЛЬНО склали курс (набрали його прохідний бал) із тих, кому він призначений. Той, хто дійшов до кінця й не набрав порогу, у зелену частину не рахується."
    >
      {courses.length === 0 ? (
        <p className="admin-hint">Немає даних.</p>
      ) : (
        <ul className="mgr-bar-list">
          {courses.map((c) => {
            const f = funnelByCourseId.get(c.id);
            const courseHref = `/manager/team?view=courses&course=${encodeURIComponent(c.slug)}`;
            const stage = (key: string, value: number, label: string) => (
              <Link key={key} href={`${courseHref}&stage=${key}`} className="mgr-funnel-stage" title={label}>
                {value}
              </Link>
            );
            return (
              <li key={c.id}>
                {/* Перенос у 2 рядки, а не біжучий рядок: у вузькій картці
                    MarqueeText прокручував би КОЖНУ назву. */}
                <div className="mgr-bar-row">
                  <Link href={courseHref} className="mgr-bar-label mgr-bar-label-stack mgr-card-link">
                    <span className="mgr-bar-label-main">{c.title}</span>
                  </Link>
                  <div className="mgr-bar-track">
                    <div className="mgr-bar-fill" style={{ width: `${live ? c.pct : 0}%` }} />
                  </div>
                  <span className="mgr-bar-value">
                    {c.completed}/{c.total} · {c.pct}%
                  </span>
                </div>
                {f && (
                  <div className="mgr-funnel" aria-label="Воронка курсу">
                    {stage("assigned", f.assigned, "Призначено")}
                    <span aria-hidden="true">›</span>
                    {stage("started", f.started, "Почали")}
                    <span aria-hidden="true">›</span>
                    {stage("passed", f.passed, "Склали")}
                    <span aria-hidden="true">›</span>
                    {stage("perfect", f.perfect, "На 100%")}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}

/**
 * Курс → модуль: єдине місце на дашборді, що доводить погану цифру до
 * конкретної ТЕМИ, а не до людини чи курсу цілком.
 */
export function HardestModulesCard({ modules, live }: { modules: DashboardStats["hardestModules"]; live: boolean }) {
  return (
    <ChartCard
      icon={<CourseIcon />}
      title="Найскладніші модулі"
      hint="Модулі, які команда найчастіше провалює — за кількістю людей, що не набрали прохідний бал модуля. Сортування за кількістю провалів, а не за відсотком: «1 з 1» дало б 100% і витіснило б реально проблемний «3 з 8». Модулі без жодного провалу в список не потрапляють. «У середньому спроб» — скільки разів людині доводилось проходити модуль: 1.0 означає «склали з першого разу», більше — матеріал давався важко навіть тим, хто зрештою склав."
    >
      {modules.length === 0 ? (
        <p className="admin-hint">Жоден модуль не провалено — складних місць поки немає.</p>
      ) : (
        <ul className="mgr-bar-list">
          {modules.map((m) => (
            // Клік — хто саме провалив цей модуль. Назва модуля + курс ДВОМА рядками.
            <BarRow
              key={m.id}
              href={`/manager/team?view=courses&module=${m.id}`}
              stacked
              label={
                <>
                  <span className="mgr-bar-label-main">{m.title}</span>
                  {m.course ? <span className="mgr-bar-label-sub">{m.course}</span> : null}
                  {m.avgAttempts > 1 ? <span className="mgr-bar-label-sub">У середньому спроб: {m.avgAttempts}</span> : null}
                </>
              }
              pct={live ? m.pct : 0}
              alert
              value={`${m.failed}/${m.total} · ${m.pct}%`}
            />
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

/**
 * Окремий запит (/api/manager/hardest-questions): картка вимкнена за
 * замовчуванням, тож зайвий запит по QuestionAnswer не виконується, поки
 * керівник сам її не увімкнув.
 */
export function HardestQuestionsCard({ state, live }: { state: HardestQuestionsState; live: boolean }) {
  return (
    <ChartCard
      icon={<CourseIcon />}
      title="Найскладніші питання"
      hint="Питання (не цілі модулі), на яких команда найчастіше помиляється, по всіх курсах разом. Точніше за «Найскладніші модулі» — показує конкретне питання, яке варто переформулювати чи пояснити в матеріалі. Питання з менш ніж 3 відповідями в список не потрапляють."
    >
      {state.loading ? (
        // Скелет на висоту готового списку (до 8 питань = картка L): інакше картка
        // з S після завантаження стрибала в L і зсувала все нижче посеред скролу.
        <LinesSkeleton rows={8} />
      ) : state.error ? (
        <p className="admin-hint">Не вдалося завантажити.</p>
      ) : !state.items || state.items.length === 0 ? (
        // Порожньо — майже завжди брак відповідей, а не збій: QuestionAnswer
        // пишеться лише коли людина реально складає модуль, і питання
        // потрапляє в список від 3 відповідей. Текст пояснює саме це.
        <p className="admin-hint">
          Поки нема статистики: питання потрапляє сюди, коли команда дала на нього щонайменше 3 відповіді в
          модулях. Показник наповнюється в міру проходження курсів.
        </p>
      ) : (
        <ul className="mgr-bar-list">
          {state.items.map((q) => (
            <BarRow
              key={q.id}
              stacked
              label={
                <>
                  <span className="mgr-bar-label-main">{q.title}</span>
                  <span className="mgr-bar-label-sub">
                    {q.module} · {q.course}
                  </span>
                </>
              }
              pct={live ? q.pct : 0}
              alert
              value={`${q.correct}/${q.total} · ${q.pct}%`}
            />
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
