"use client";

import Link from "next/link";
import { RingsIcon, CalendarIcon, CheckIcon, ClockIcon } from "@/components/ui/icons";
import { CompletionRing } from "@/components/ui/CompletionRing";
import { formatDuration } from "@/components/manager/EnrollmentRow";
import { BarRow, ChartCard } from "@/components/manager/dashboard/ChartCard";
import type { DashboardStats, WeekTrend } from "@/components/manager/dashboard/types";

/** Стан анімації заповнення картки: active — уже на екрані, instant — зіграла раніше. */
type Play = { active: boolean; instant: boolean };

/**
 * Колір кільця відносно решти кілець у тій самій сітці — не фіксований
 * per-метрика колір (той підхід плутав: "Розпочали 100%" виходило
 * золотим, а "Виконано 50%" — зеленим, хоча перше явно краще другого).
 * Ранжуємо 4 значення одне відносно одного: найгірше з чотирьох —
 * --cb-fail, найкраще — --cb-success, проміжні — плавний перехід через
 * --cb-alert (світлофор), той самий color-mix-прийом, що вже є в
 * StatusBadge (components/ui/StatusBadge.tsx, .status-pill у globals.css).
 */
function rateColor(pct: number, allValues: number[]): string {
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  if (max === min) return "var(--cb-success)"; // усі рівні — нема "гіршого", вважаємо добре
  const t = (pct - min) / (max - min); // 0 = найменше з чотирьох, 1 = найбільше
  if (t <= 0.5) {
    const mix = Math.round(t * 200);
    return `color-mix(in srgb, var(--cb-alert) ${mix}%, var(--cb-fail) ${100 - mix}%)`;
  }
  const mix = Math.round((t - 0.5) * 200);
  return `color-mix(in srgb, var(--cb-success) ${mix}%, var(--cb-alert) ${100 - mix}%)`;
}

/**
 * Чотири кільця — кожне посилання на список за тим самим критерієм:
 * «Вчасно» веде до доповнення (хто НЕ вчасно), «Розпочали» — до тих, хто ще
 * не почав: діяти треба саме по них.
 */
export function RingsCard({ stats, play }: { stats: DashboardStats; play: Play }) {
  const values = [stats.completionRate, stats.passRate, stats.onTimeRate, stats.startedRate];
  const ring = (pct: number, label: string, href: string) => (
    <CompletionRing active={play.active} instant={play.instant} pct={pct} label={label} color={rateColor(pct, values)} href={href} />
  );
  return (
    <ChartCard
      icon={<RingsIcon />}
      title="Показники команди"
      hint="Усі чотири кільця рахують ПРИЗНАЧЕННЯ (людина × курс), лише знаменники різні: «Виконано» — частка доведених до кінця; «Складено» — з них ті, що набрали прохідний бал курсу; «Вчасно» — вкладені в дедлайн серед тих, де дедлайн уже вирішено; «Розпочато» — ті, де є будь-який рух. Скільки ЛЮДЕЙ у якому стані — у полосі «Стан команди» вгорі. Клік веде до того, по чому треба діяти: «Вчасно» — до тих, хто не вклався, «Розпочато» — до ще не розпочатих."
    >
      <div className="mgr-ring-grid">
        {ring(stats.completionRate, "Виконано", "/manager/team?view=courses&status=completed")}
        {ring(stats.passRate, "Складено (80%+)", "/manager/team?view=courses&status=passed")}
        {ring(stats.onTimeRate, "Вчасно", "/manager/team?view=courses&timing=late")}
        {ring(stats.startedRate, "Розпочато", "/manager/team?view=courses&status=not_started")}
      </div>
    </ChartCard>
  );
}

/** Складені модулі за останні 6 тижнів — за реальними датами ModuleCompletion.completedAt. */
export function TrendCard({ weeks, live }: { weeks: WeekTrend[]; live: boolean }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <ChartCard
      icon={<CalendarIcon />}
      title="Активність по тижнях"
      className="mgr-trend-card"
      hint="Скільки модулів команда склала кожного з останніх 6 тижнів — за реальними датами складання. Наведіть на стовпчик, щоб побачити, хто саме складав того тижня."
    >
      {weeks.every((w) => w.count === 0) ? (
        <p className="admin-hint">Немає завершених модулів за останні 6 тижнів.</p>
      ) : (
        <div className="mgr-trend-row">
          {weeks.map((w) => (
            <Link
              key={w.label}
              href={`/manager/team?week=${w.weekIndex}`}
              className="mgr-trend-col mgr-card-link"
              // Розбивка по людях — у підказці бару; клік — список тих, хто складав модулі того тижня.
              title={w.people.length > 0 ? `${w.label}: ${w.count}\n${w.people.map((p) => `${p.name} — ${p.count}`).join("\n")}` : `${w.label}: ${w.count}`}
            >
              <div className="mgr-trend-bar-track">
                <div className="mgr-trend-bar-fill" style={{ height: live ? `${Math.max(4, (w.count / max) * 100)}%` : "0%" }} />
              </div>
              <span className="mgr-trend-count">{w.count}</span>
              {/* Коротко, в одному стилі з «-1 тиж.»: повне «Цей тиждень» на
                  телефоні переносилось на два рядки й зсувало стовпчик над ним.
                  Повний підпис — у підказці й у Excel-звіті. */}
              <span className="mgr-trend-label">{w.weekIndex === 0 ? "Цей тиж." : w.label}</span>
            </Link>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

/**
 * Наскільки матеріал зрозумілий з першого проходження. Низький відсоток при
 * високому "Складено" означає, що команда бере курс не знанням, а повторами.
 */
export function FirstTryCard({ firstAttempt, play }: { firstAttempt: DashboardStats["firstAttempt"]; play: Play }) {
  return (
    <ChartCard
      icon={<CheckIcon />}
      title="З першої спроби"
      className="mgr-first-try-card"
      hint="Частка призначень, де ПЕРША ж спроба була успішною, серед усіх, де спроба взагалі була. Ті, хто склав із другого разу або не склав досі, знижують показник. Низьке значення при високому «Складено» — курс беруть повторами, а не з розуміння."
    >
      {firstAttempt.total === 0 ? (
        <p className="admin-hint">Немає жодної завершеної спроби.</p>
      ) : (
        <div className="mgr-first-try-body">
          <CompletionRing active={play.active} instant={play.instant} pct={firstAttempt.pct} label="З першої спроби" />
          <ul className="mgr-first-try-legend">
            <li>
              <b>{firstAttempt.passedFirst}</b>
              <span>склали одразу</span>
            </li>
            <li>
              <Link href="/manager/team?view=courses&retried=1" className="mgr-card-link">
                <b>{firstAttempt.retried}</b>
                <span>з другої та далі</span>
              </Link>
            </li>
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

/**
 * Саме по собі "довго/швидко" не добре й не погано — цінність у крайнощах:
 * купка спроб "до 10 хв" на змістовному курсі означає, що його прогортали,
 * а хвіст "понад 40 хв" — що матеріал важкий або незручно поданий.
 */
export function DurationCard({ durations, live }: { durations: DashboardStats["durations"]; live: boolean }) {
  const max = Math.max(1, ...durations.buckets.map((b) => b.count));
  return (
    <ChartCard
      icon={<ClockIcon />}
      title="Час на проходження"
      hint="Скільки часу займала одна спроба проходження. Поруч — МЕДІАНА, а не середнє: одна забута відкритою вкладка на три години зсунула б середнє так, що воно перестало б описувати команду. «У фокусі» — час, коли вкладка справді була активною; велика різниця між ним і загальним означає «відкрив і пішов»."
    >
      {durations.total === 0 ? (
        <p className="admin-hint">Немає жодної спроби з виміряним часом.</p>
      ) : (
        <>
          <ul className="mgr-bar-list">
            {durations.buckets.map((b) => (
              <BarRow key={b.key} label={b.label} pct={live ? (b.count / max) * 100 : 0} value={b.count} />
            ))}
          </ul>
          <p className="admin-hint mgr-duration-median">
            Медіана: {formatDuration(durations.medianSeconds)}
            {durations.medianActiveSeconds != null ? ` · у фокусі ${formatDuration(durations.medianActiveSeconds)}` : ""}
          </p>
        </>
      )}
    </ChartCard>
  );
}
