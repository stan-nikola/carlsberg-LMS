"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronIcon,
  TrendIcon,
  PeopleIcon,
  ClockIcon,
  CalendarIcon,
  MedalIcon,
  CheckIcon,
  XIcon,
  CourseIcon,
} from "@/components/icons";
import { HintDot } from "@/components/HintDot";
import { medalTier } from "@/lib/progress";
import { PageSkeleton, LinesSkeleton } from "@/components/Skeleton";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { ProfileCard } from "@/components/ProfileCard";
import { MarqueeText } from "@/components/MarqueeText";

const STATUS_META = {
  not_started: { label: "Не розпочато", cls: "status-pill-neutral" },
  in_progress: { label: "В процесі", cls: "status-pill-alert" },
  overdue: { label: "Прострочено", cls: "status-pill-fail" },
};

// status="completed" саме по собі означає лише "пройшов до кінця" —
// НЕ "склав". Прохідний бал налаштовується per-курс (Course.passThreshold,
// дефолт 80% — той самий поріг, що вже рахує passed = scorePercent >=
// course.passThreshold при генерації даних) — completed з passed:false
// мусить бути червоним "Не складено", а не зеленим "Завершено", інакше
// провалений курс візуально виглядає як успіх.
function StatusPill({ status, passed }) {
  if (status === "completed") {
    return <StatusBadge passed={Boolean(passed)} />;
  }
  const meta = STATUS_META[status] || STATUS_META.not_started;
  return <span className={`status-pill ${meta.cls}`}>{meta.label}</span>;
}

function formatDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** durationSeconds -> "12 хв" / "1 год 40 хв" — той самий формат, що вже
 * планувався для показу часу проходження в кабінеті керівника. */
function formatDuration(seconds) {
  if (seconds == null) return null;
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} хв`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} год ${minutes} хв` : `${hours} год`;
}

/** Кільце — той самий strokeDasharray-прийом, що вже є в SpinnerIcon
 * (components/icons.jsx), тільки з реальним % замість нескінченного
 * обертання. Компактний варіант (менший stroke) для сітки 2×2 замість
 * одного великого кільця, яке займало багато місця під один-єдиний
 * показник. Кінці НЕ заокруглені (strokeLinecap не задано → butt за
 * замовчуванням) — чіткий, "інженерний" вигляд замість м'якого.
 * Заповнення анімується від 0 при першому рендері (mounted-стан +
 * transition на stroke-dasharray, --dur-slow/--ease-premium — ті самі
 * токени руху, що й скрізь у проєкті), а не миттєво стрибає на
 * фінальне значення. */
/**
 * Колір кільця відносно решти кілець у тій самій сітці — не фіксований
 * per-метрика колір (той підхід плутав: "Розпочали 100%" виходило
 * золотим, а "Виконано 50%" — зеленим, хоча перше явно краще другого).
 * Ранжуємо 4 значення одне відносно одного: найгірше з чотирьох —
 * --cb-fail, найкраще — --cb-success, проміжні — плавний перехід через
 * --cb-alert (світлофор), той самий color-mix-прийом, що вже є в
 * StatusBadge (components/StatusBadge.tsx, .status-pill у globals.css).
 */
function rateColor(pct, allValues) {
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
 * Пояснення до діаграми по ховеру — спільний HintDot. Кожен блок
 * дашборда рахує щось своє, і зі схожих назв ("Виконано" / "Складено" /
 * "З першої спроби") різницю не видно: підказка каже, що САМЕ в
 * знаменнику, бо неправильно прочитана метрика гірша за відсутню.
 */
function ChartHint({ text }) {
  return <HintDot text={text} />;
}

function CompletionRing({ pct, label, color = "var(--cb-secondary)" }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = animated ? (clamped / 100) * circumference : 0;

  return (
    <div className="mgr-ring-item">
      <svg viewBox="0 0 120 120" className="mgr-ring" role="img" aria-label={`${label ? label + ": " : ""}${clamped}%`}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--line)" strokeWidth="14" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="14"
          className="mgr-ring-fill"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 60 60)"
        />
        <text x="60" y="67" textAnchor="middle" className="mgr-ring-text">
          {clamped}%
        </text>
      </svg>
      {label && <span className="mgr-ring-label">{label}</span>}
    </div>
  );
}

function EnrollmentRow({ enrollment }) {
  const date = formatDate(enrollment.completedAt);
  const dueDate = formatDate(enrollment.dueDate);
  const duration = formatDuration(enrollment.durationSeconds);
  const [showAttempts, setShowAttempts] = useState(false);
  const hasHistory = enrollment.attempts && enrollment.attempts.length > 1;

  return (
    <li className="mgr-enrollment-row">
      <div className="mgr-enrollment-main">
        {/* Перенос у 2 рядки, а не біжучий рядок: відколи курси лежать у
            гумовій сітці (до 4 в ряд), картка вдвічі-втричі вужча за
            колишній рядок на всю ширину, і MarqueeText прокручував би
            назву КОЖНОГО курсу — список читався б як зламаний. */}
        <span className="mgr-enrollment-title">{enrollment.course.title}</span>
        <StatusPill status={enrollment.status} passed={enrollment.passed} />
      </div>
      <div className="mgr-enrollment-stats">
        {enrollment.scorePercent != null && <span className="mgr-stat-chip">{enrollment.scorePercent}% балів</span>}
        {date ? (
          <span className="mgr-stat-chip">
            <CalendarIcon /> {date}
          </span>
        ) : (
          // Ще не завершено (overdue/in_progress/not_started) — дедлайн
          // замість дати завершення, щоб рядок статистики НІКОЛИ не був
          // порожнім (порожній рядок під заголовком — саме та картка, де
          // заголовок курсу виглядав "збільшеним": йому просто нема з
          // чим порівнятись поруч, хоча реальний розмір той самий 13.5px).
          dueDate && (
            <span className="mgr-stat-chip">
              <CalendarIcon /> Дедлайн: {dueDate}
            </span>
          )
        )}
        {duration && (
          <span className="mgr-stat-chip">
            <ClockIcon /> {duration}
          </span>
        )}
        {/* Серію правильних відповідей (longestCorrectStreak) тут більше не
            показуємо — лишилась у базі та Excel-звітах (2026-09-17). */}
        {/* Медаль за той самий бал, що вже показаний вище — золото/срібло/
            бронза за порогом (100% / 95%+ / 90%+): наочний символ поруч із
            цифрою. */}
        {medalTier(enrollment.scorePercent) && (
          <span className="mgr-stat-chip mgr-medal-chip" title={`${enrollment.scorePercent}% — медаль`}>
            <MedalIcon tier={medalTier(enrollment.scorePercent)} />
          </span>
        )}
      </div>
      {/* Курс -> модулі: раніше тут закінчувалась інформація про людину на
          рівні курсу в цілому — не було видно, який САМЕ модуль складено, а
          який ще ні (лише фінальний бал за весь курс). Список модулів
          завжди видимий (не під ще одним акордеоном) — це основна причина,
          чому керівник розгортає людину, ховати саме це не варто.
          ModuleCompletion.longestCorrectStreak — серія поспіль ПРАВИЛЬНИХ
          відповідей у межах саме цього модуля (не всього курсу); для
          завершень, записаних до появи цього поля, лишається null — не
          показуємо чіп, а не вигадуємо число. */}
      {/* Колонки бал / серія / медаль — у КОЖНОМУ рядку списку, якщо є
          хоч в одному (порожні теж), інакше значення різних рядків
          з'їжджали: «80% 🎯 4» без медалі ставав під «🎯 5 🏅» сусіда
          (те саме рішення, що в CourseTile). */}
      {enrollment.modules && enrollment.modules.length > 0 && (
        <ul className="mgr-module-list">
          {enrollment.modules.map((m, _i, all) => (
            <li key={m.id} className={`mgr-module-row${m.passed === true ? " is-pass" : m.passed === false ? " is-fail" : " is-pending"}`}>
              <span className="mgr-module-status-icon">
                {m.passed === true ? <CheckIcon /> : m.passed === false ? <XIcon /> : <span className="mgr-module-dot" aria-hidden="true" />}
              </span>
              <span className="mgr-module-title">{m.title}</span>
              {all.some((x) => x.scorePercent != null) && (
                <span className="mgr-module-score">{m.scorePercent != null ? `${m.scorePercent}%` : ""}</span>
              )}
              {all.some((x) => medalTier(x.scorePercent)) && (
                <span className="mgr-module-medal" title={medalTier(m.scorePercent) ? `${m.scorePercent}% — медаль за модуль` : undefined}>
                  {medalTier(m.scorePercent) && <MedalIcon tier={medalTier(m.scorePercent)} />}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasHistory && (
        <div className="mgr-attempts">
          <button type="button" className="admin-btn-link" onClick={() => setShowAttempts((v) => !v)}>
            {showAttempts ? "Сховати історію спроб" : `Історія спроб (${enrollment.attempts.length})`}
          </button>
          {showAttempts && (
            <ul className="mgr-attempts-list">
              {enrollment.attempts.map((a) => (
                <li key={a.id} className="mgr-attempts-item">
                  <span>{formatDate(a.completedAt)}</span>
                  <span>{a.scorePercent}% балів</span>
                  <span>{formatDuration(a.durationSeconds)}</span>
                  <StatusBadge passed={Boolean(a.passed)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function TeamNode({ node, summaryByEmployeeId, ratingByEmployeeId }) {
  const [showChildren, setShowChildren] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  const summary = summaryByEmployeeId[node.id];
  const hasChildren = node.children && node.children.length > 0;
  // Усі призначені курси реально завершені й усі складені — не лише
  // "дійшов до кінця" (summary.completed), а й жодного summary.failed
  // (Enrollment.passed === false десь серед завершених).
  const allCoursesPassed = Boolean(summary && summary.total > 0 && summary.completed === summary.total && summary.failed === 0);

  async function toggleDetail() {
    const next = !showDetail;
    setShowDetail(next);
    if (next && !detail && !detailLoading) {
      setDetailLoading(true);
      setDetailError(false);
      try {
        const res = await fetch(`/api/manager/employees/${node.id}`);
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setDetail(data.enrollments || []);
      } catch {
        setDetailError(true);
      } finally {
        setDetailLoading(false);
      }
    }
  }

  return (
    <li className="mgr-team-node">
      <div className="mgr-team-row">
        {/* Завжди 2 фіксовані підрядки (не "коли не влазить в один") —
            один/два бейджі більше не перекидають рядок в інший layout:
            раніше в рядків з 2 бейджами (є прострочення + середній бал)
            вміст переносився на другий рядок і "стрибав" ліворуч
            відносно рядків з 1 бейджем, що виглядало як зламаний
            контейнер із зайвим відступом. */}
        <div className="mgr-team-row-top">
          {/* Один шеврон зліва, ПЕРЕД іменем/посадою — той самий
              ChevronIcon+.open поворот, що скрізь у проєкті
              (admin-course-row-caret — CourseRow в AdminDashboard.jsx).
              Коли є підлеглі (глибша ланка ієрархії, напр. у ASM/RM) —
              він розкриває ЇХ, а деталі власних курсів людини відкриваються
              кліком по імені; коли підлеглих нема (як у всієї поточної
              команди СВ) — цей самий шеврон зліва розкриває деталі курсів,
              а не порожній заповнювач. */}
          {hasChildren ? (
            <button
              type="button"
              className={`admin-course-row-caret${showChildren ? " open" : ""}`}
              onClick={() => setShowChildren((v) => !v)}
              aria-label={showChildren ? "Згорнути підлеглих" : "Розгорнути підлеглих"}
            >
              <ChevronIcon />
            </button>
          ) : (
            <button
              type="button"
              className={`admin-course-row-caret${showDetail ? " open" : ""}`}
              onClick={toggleDetail}
              aria-label={showDetail ? "Згорнути деталі" : "Розгорнути деталі"}
            >
              <ChevronIcon />
            </button>
          )}

          <Avatar name={node.name} src={node.avatarUrl} size="sm" />
          <button type="button" className="mgr-team-name-btn" onClick={toggleDetail}>
            <MarqueeText className="mgr-team-name">{node.name}</MarqueeText>
            <MarqueeText className="mgr-team-meta">
              {node.position?.name || "—"}
              {/* Territory для польових ролей (ТП/Технік/Мерчендайзер, рівень
                  4-5) резолвиться лише до цілого RM-регіону при імпорті (див.
                  CLAUDE.md) — показувати її тут оманливо ("Північно-Східний
                  регіон" однаковий для всіх, нічого не каже про конкретну
                  людину). Видимо territory лише для SV і вище, де вона
                  реально означає їхню зону відповідальності. */}
              {node.territory && (node.position?.level ?? 99) <= 3 ? ` · ${node.territory.name}` : ""}
            </MarqueeText>
          </button>
        </div>

        {summary && (
          <div className="mgr-team-row-bottom">
            <div className="mgr-team-badges">
              <span className="mgr-badge">
                {summary.completed}/{summary.total} курсів
              </span>
              {/* Червона заливка, коли є завершене, але НЕ складене
                  призначення (summary.failed — реальний Enrollment.passed,
                  кожен модуль ≥ Course.passThreshold per-курс, а не
                  порівняння з захардкодженими 80% тут). */}
              {summary.avgScore != null && (
                <span className={`mgr-badge mgr-badge-score${summary.failed > 0 ? " mgr-badge-fail" : ""}`}>
                  {summary.avgScore}%
                </span>
              )}
              {/* "Курс виконано" + медаль — лише коли ВСІ призначені курси
                  завершені і ВСІ складені (жодного summary.failed). */}
              {allCoursesPassed && (
                <>
                  <span className="mgr-badge mgr-badge-success">Курс виконано</span>
                  {medalTier(summary.avgScore) && (
                    <span className="mgr-badge-medal" title={`${summary.avgScore}% — медаль`}>
                      <MedalIcon tier={medalTier(summary.avgScore)} />
                    </span>
                  )}
                </>
              )}
              {summary.overdue > 0 && <span className="mgr-badge mgr-badge-overdue">{summary.overdue} прострочено</span>}
            </div>
          </div>
        )}
      </div>

      {showDetail && (
        <div className="mgr-team-detail">
          {detailLoading && <LinesSkeleton rows={4} />}
          {detailError && <p className="admin-hint">Не вдалося завантажити.</p>}
          {detail && detail.length === 0 && <p className="admin-hint">Курсів не призначено.</p>}
          {detail && detail.length > 0 && (
            <ul className="mgr-enrollment-list card-grid">
              {detail.map((e) => (
                <EnrollmentRow key={e.id} enrollment={e} />
              ))}
            </ul>
          )}
        </div>
      )}

      {hasChildren && showChildren && (
        <ul className="mgr-team-children">
          {node.children.map((child) => (
            <TeamNode key={child.id} node={child} summaryByEmployeeId={summaryByEmployeeId} ratingByEmployeeId={ratingByEmployeeId} />
          ))}
        </ul>
      )}
    </li>
  );
}

// Фільтр "Моєї команди" за статусом — окремо від текстового пошуку за
// іменем, обидва можуть діяти одночасно (AND). "all" — без фільтра,
// показується повне дерево; будь-який інший варіант перемикає на
// плаский список (як і пошук) — фільтрувати ЗА СТАТУСОМ і зберігати
// вкладеність одночасно сенсу не має.
const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Усі" },
  { value: "overdue", label: "Прострочено" },
  { value: "in_progress", label: "В процесі" },
  { value: "not_started", label: "Не розпочав" },
  { value: "failed", label: "Не склав" },
];

function matchesStatusFilter(summary, filter) {
  if (filter === "all") return true;
  if (!summary) return false;
  if (filter === "overdue") return summary.overdue > 0;
  if (filter === "in_progress") return summary.inProgress > 0;
  if (filter === "not_started") return summary.notStarted > 0;
  if (filter === "failed") return summary.failed > 0;
  return true;
}

const SORT_OPTIONS = [
  { value: "overdue", label: "Прострочені спочатку" },
  { value: "rating", label: "За рейтингом" },
];

function sortNodes(nodes, sortBy, summaryByEmployeeId, ratingByEmployeeId) {
  const key =
    sortBy === "rating"
      ? (n) => ratingByEmployeeId?.[n.id]?.normalized || 0
      : (n) => summaryByEmployeeId[n.id]?.overdue || 0;
  return nodes.slice().sort((a, b) => key(b) - key(a));
}

function flattenTree(nodes, out = []) {
  for (const node of nodes) {
    out.push(node);
    if (node.children && node.children.length > 0) flattenTree(node.children, out);
  }
  return out;
}

/**
 * Десктопний дашборд /manager — KPI, "Мої курси", 2 графіки (кільце +
 * бари по курсах), дерево команди з ліниво підвантажуваними деталями по
 * кожній людині. Один запит на старті (/api/manager/overview), деталі
 * конкретної людини — лише при розкритті її картки
 * (/api/manager/employees/[id]).
 */
export function ManagerDashboard() {
  const [state, setState] = useState({ loading: true, data: null, error: false });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("overdue");
  // Той самий "стартуємо з 0, після монтування переходимо на реальне
  // значення" прийом, що CompletionRing — для горизонтальних барів
  // (% виконання по курсу) і стовпчиків тренду по тижнях, щоб їхнє
  // заповнення теж анімувалось при появі даних, а не стрибало миттєво.
  const [barsAnimated, setBarsAnimated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/manager/overview");
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (!cancelled) setState({ loading: false, data, error: false });
      } catch {
        if (!cancelled) setState({ loading: false, data: null, error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.data) return;
    const id = requestAnimationFrame(() => setBarsAnimated(true));
    return () => cancelAnimationFrame(id);
  }, [state.data]);

  const flatTeam = useMemo(() => (state.data ? flattenTree(state.data.team.tree) : []), [state.data]);

  const filteredFlat = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasFilter = Boolean(q) || statusFilter !== "all";
    if (!hasFilter) return null;
    const summaryMap = state.data?.team.summaryByEmployeeId || {};
    return flatTeam
      .filter((n) => (q ? n.name.toLowerCase().includes(q) : true))
      .filter((n) => matchesStatusFilter(summaryMap[n.id], statusFilter))
      .map((n) => ({ ...n, children: [] }));
  }, [flatTeam, query, statusFilter, state.data]);

  if (state.loading) {
    return (
      <div className="admin-page manager-page">
        <PageSkeleton />
      </div>
    );
  }
  if (state.error || !state.data) {
    return (
      <div className="admin-page manager-page">
        <p className="admin-subtitle">Не вдалося завантажити дані команди. Спробуйте оновити сторінку.</p>
      </div>
    );
  }

  const { me, team } = state.data;
  const { stats, summaryByEmployeeId, tree, weeklyTrend, rating } = team;
  const trendMax = Math.max(1, ...weeklyTrend.map((w) => w.count));
  const visibleNodes = sortNodes(filteredFlat ?? tree, sortBy, summaryByEmployeeId, rating.byEmployeeId);
  // Для rateColor нижче — 4 показники "Показники команди" ранжуються один
  // відносно одного, не за фіксованим per-метрика кольором.
  const ringValues = [stats.completionRate, stats.passRate, stats.onTimeRate, stats.engagementRate];
  // Бари в "Дедлайнах" і "Розподілі балів" міряються від найбільшої
  // корзини, а не від суми: корзини взаємовиключні, і при 5 корзинах
  // частка від суми зробила б усі бари однаково куцими.
  const deadlineTotal = stats.deadlineHorizon.reduce((sum, b) => sum + b.count, 0);
  const deadlineMax = Math.max(1, ...stats.deadlineHorizon.map((b) => b.count));
  const scoreTotal = stats.scoreDistribution.reduce((sum, b) => sum + b.count, 0);
  const scoreDistMax = Math.max(1, ...stats.scoreDistribution.map((b) => b.count));
  const durationMax = Math.max(1, ...stats.durations.buckets.map((b) => b.count));

  return (
    <div className="admin-page manager-page">
      <div className="mgr-page-header">
        <div>
          <div className="greeting">КАБІНЕТ КЕРІВНИКА</div>
          <h1 className="hub-h1">Команда</h1>
        </div>
        {/* Прямий лінк на /api/manager/export — браузер сам ініціює
            завантаження по Content-Disposition:attachment, без fetch+blob. */}
        <a className="admin-btn-link mgr-export-link" href="/api/manager/export">
          Завантажити звіт (Excel)
        </a>
      </div>

      <ProfileCard dbName={me.name} hasEmail={me.hasEmail} externalCode={me.externalCode} levelLabel={me.levelLabel} avatarUrl={me.avatarUrl} />

      <div className="mgr-kpi-row">
        <div className="mgr-kpi-tile">
          <b>{stats.teamSize}</b>
          <span>у команді</span>
        </div>
        <div className="mgr-kpi-tile">
          <b>{stats.avgScore != null ? `${stats.avgScore}%` : "—"}</b>
          <span>середній бал</span>
        </div>
        {/* Середній % команди від найкращих у своїх посадах + місце серед
            команд керівників тієї ж посади (ASM серед ASM). */}
        <div className="mgr-kpi-tile" title="Середній рейтинг підлеглих: % від найкращого у своїй посаді">
          <b>{rating.avg}%</b>
          <span>рейтинг команди{rating.rank ? ` · №${rating.rank} з ${rating.teams}` : ""}</span>
        </div>
        <div className={`mgr-kpi-tile${stats.overdueCount > 0 ? " mgr-kpi-tile-alert" : ""}`}>
          <b>{stats.overdueCount}</b>
          <span>прострочено</span>
        </div>
        {/* Замінено з "56% виконання команди" — той самий % тепер живе в
            кільці "Виконано" нижче, дублювати число в квадратній плитці
            й у кільці поруч не мало сенсу. Тут — конкретна кількість
            людей (скільком написати), а не ще один відсоток. */}
        <div className={`mgr-kpi-tile${stats.noActivityCount > 0 ? " mgr-kpi-tile-alert" : ""}`}>
          <b>{stats.noActivityCount}</b>
          <span>без активності</span>
        </div>
      </div>

      <section className="mgr-section mgr-charts">
        <div className="mgr-chart-card">
          <h2>
            Показники команди
            <ChartHint text="Чотири різні знаменники: «Виконано» — частка призначень, доведених до кінця; «Складено» — з них ті, що набрали прохідний бал курсу; «Вчасно» — вкладені в дедлайн серед тих, де дедлайн уже вирішено; «Розпочали» — частка людей, що взялися бодай за один курс." />
          </h2>
          <div className="mgr-ring-grid">
            <CompletionRing pct={stats.completionRate} label="Виконано" color={rateColor(stats.completionRate, ringValues)} />
            <CompletionRing pct={stats.passRate} label="Складено (80%+)" color={rateColor(stats.passRate, ringValues)} />
            <CompletionRing pct={stats.onTimeRate} label="Вчасно" color={rateColor(stats.onTimeRate, ringValues)} />
            <CompletionRing pct={stats.engagementRate} label="Розпочали" color={rateColor(stats.engagementRate, ringValues)} />
          </div>
        </div>

        {/* Тренд по тижнях — коротко: к-сть складених модулів за останні
            6 тижнів (реальні дати ModuleCompletion.completedAt, без
            окремої "знімкової" інфраструктури — див. lib/managerDashboard.js
            getWeeklyTrend). */}
        <div className="mgr-chart-card mgr-trend-card">
          <h2>
            <CalendarIcon /> Активність по тижнях
            <ChartHint text="Скільки модулів команда склала кожного з останніх 6 тижнів — за реальними датами складання. Наведіть на стовпчик, щоб побачити, хто саме складав того тижня." />
          </h2>
          {weeklyTrend.every((w) => w.count === 0) ? (
            <p className="admin-hint">Немає завершених модулів за останні 6 тижнів.</p>
          ) : (
            <div className="mgr-trend-row">
              {weeklyTrend.map((w) => (
                <div
                  key={w.label}
                  className="mgr-trend-col"
                  // Розбивка по людях — прямо в підказці бару (хто саме
                  // складав модулі того тижня), без окремого рядка на
                  // людину в і так компактній картці.
                  title={
                    w.people.length > 0
                      ? `${w.label}: ${w.count}\n${w.people.map((p) => `${p.name} — ${p.count}`).join("\n")}`
                      : `${w.label}: ${w.count}`
                  }
                >
                  <div className="mgr-trend-bar-track">
                    <div
                      className="mgr-trend-bar-fill"
                      style={{ height: barsAnimated ? `${Math.max(4, (w.count / trendMax) * 100)}%` : "0%" }}
                    />
                  </div>
                  <span className="mgr-trend-count">{w.count}</span>
                  <span className="mgr-trend-label">{w.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Єдиний блок дашборда, що дивиться ВПЕРЕД — решта показників
            ретроспективні. Рахуються лише незавершені призначення
            (lib/managerDashboard.js bucketDeadlineHorizon): у завершеного
            дедлайн уже не має сенсу, вкладеність у нього міряє окремий
            показник "Вчасно". */}
        <div className="mgr-chart-card">
          <h2>
            <ClockIcon /> Дедлайни на горизонті
            <ChartHint text="Незавершені призначення за тим, скільки лишилось до дедлайну. Завершені сюди не входять — у них дедлайн уже вирішено. Відповідає на питання «кому написати цього тижня», а не «що вже сталось»." />
          </h2>
          {deadlineTotal === 0 ? (
            <p className="admin-hint">Немає незавершених призначень.</p>
          ) : (
            <ul className="mgr-bar-list">
              {stats.deadlineHorizon.map((b) => (
                <li key={b.key} className="mgr-bar-row">
                  <span className="mgr-bar-label">{b.label}</span>
                  <div className="mgr-bar-track">
                    <div
                      className={`mgr-bar-fill${b.alert && b.count > 0 ? " mgr-bar-fill-alert" : ""}`}
                      style={{ width: `${barsAnimated ? (b.count / deadlineMax) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="mgr-bar-value">{b.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Розкид за середнім балом: 86% — це може бути "вся команда рівно
            на 86" або "половина на 100, половина ледь за порогом", і це
            різні управлінські ситуації. */}
        <div className="mgr-chart-card">
          <h2>
            <MedalIcon /> Розподіл балів
            <ChartHint text="Скільки завершених курсів потрапило в кожен діапазон балу. Показує розкид, який ховається за одним середнім балом. Межі тут — просто рівні відрізки шкали, а не прохідний бал: він свій у кожного курсу." />
          </h2>
          {scoreTotal === 0 ? (
            <p className="admin-hint">Немає завершених курсів із балом.</p>
          ) : (
            <ul className="mgr-bar-list">
              {stats.scoreDistribution.map((b) => (
                <li key={b.key} className="mgr-bar-row">
                  <span className="mgr-bar-label">{b.label}</span>
                  <div className="mgr-bar-track">
                    <div
                      className="mgr-bar-fill"
                      style={{ width: `${barsAnimated ? (b.count / scoreDistMax) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="mgr-bar-value">{b.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Наскільки матеріал зрозумілий з першого проходження. Низький
            відсоток при високому "Складено" означає, що команда бере курс
            не знанням, а повторами. */}
        <div className="mgr-chart-card mgr-chart-card-wide mgr-first-try-card">
          <h2>
            <CheckIcon /> З першої спроби
            <ChartHint text="Частка призначень, де ПЕРША ж спроба була успішною, серед усіх, де спроба взагалі була. Ті, хто склав із другого разу або не склав досі, знижують показник. Низьке значення при високому «Складено» — курс беруть повторами, а не з розуміння." />
          </h2>
          {stats.firstAttempt.total === 0 ? (
            <p className="admin-hint">Немає жодної завершеної спроби.</p>
          ) : (
            <div className="mgr-first-try-body">
              <CompletionRing pct={stats.firstAttempt.pct} label="З першої спроби" />
              <ul className="mgr-first-try-legend">
                <li>
                  <b>{stats.firstAttempt.passedFirst}</b>
                  <span>склали одразу</span>
                </li>
                <li>
                  <b>{stats.firstAttempt.retried}</b>
                  <span>з другої та далі</span>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Саме по собі "довго/швидко" не добре й не погано — цінність у
            крайнощах: купка спроб "до 10 хв" на змістовному курсі означає,
            що його прогортали, а хвіст "понад 40 хв" — що матеріал важкий
            або незручно поданий. */}
        <div className="mgr-chart-card mgr-chart-card-wide">
          <h2>
            <ClockIcon /> Час на проходження
            <ChartHint text="Скільки часу займала одна спроба проходження. Поруч — МЕДІАНА, а не середнє: одна забута відкритою вкладка на три години зсунула б середнє так, що воно перестало б описувати команду. «У фокусі» — час, коли вкладка справді була активною; велика різниця між ним і загальним означає «відкрив і пішов»." />
          </h2>
          {stats.durations.total === 0 ? (
            <p className="admin-hint">Немає жодної спроби з виміряним часом.</p>
          ) : (
            <>
              <ul className="mgr-bar-list">
                {stats.durations.buckets.map((b) => (
                  <li key={b.key} className="mgr-bar-row">
                    <span className="mgr-bar-label">{b.label}</span>
                    <div className="mgr-bar-track">
                      <div
                        className="mgr-bar-fill"
                        style={{
                          width: `${barsAnimated ? (b.count / durationMax) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="mgr-bar-value">{b.count}</span>
                  </li>
                ))}
              </ul>
              <p className="admin-hint mgr-duration-median">
                Медіана: {formatDuration(stats.durations.medianSeconds)}
                {stats.durations.medianActiveSeconds != null
                  ? ` · у фокусі ${formatDuration(stats.durations.medianActiveSeconds)}`
                  : ""}
              </p>
            </>
          )}
        </div>

        {/* Було "% виконання" (рахувало status===completed, тобто й
            провалені курси теж) — перейменовано разом зі зміною лічильника
            в lib/managerDashboard.js getDashboardStats(): тепер рахує лише
            РЕАЛЬНО складені (passed===true, кожен модуль ≥ Course.
            passThreshold), інакше курс без жодного складеного показував би
            оманливі 100% лише тому, що всі до нього "дійшли". */}
        <div className="mgr-chart-card mgr-chart-card-wide">
          <h2>
            <TrendIcon /> % складання по курсу
            <ChartHint text="Скільки людей РЕАЛЬНО склали курс (набрали його прохідний бал) із тих, кому він призначений. Той, хто дійшов до кінця й не набрав порогу, у зелену частину не рахується." />
          </h2>
          {stats.courseBreakdown.length === 0 ? (
            <p className="admin-hint">Немає даних.</p>
          ) : (
            <ul className="mgr-bar-list">
              {stats.courseBreakdown.map((c) => (
                <li key={c.title} className="mgr-bar-row">
                  {/* Перенос у 2 рядки, а не біжучий рядок: у сітці на 4
                      колонки картка вдвічі вужча, і MarqueeText починав
                      прокручувати КОЖНУ назву курсу — список читався як
                      зламаний. */}
                  <span className="mgr-bar-label mgr-bar-label-stack">
                    <span className="mgr-bar-label-main">{c.title}</span>
                  </span>
                  <div className="mgr-bar-track">
                    <div className="mgr-bar-fill" style={{ width: `${barsAnimated ? c.pct : 0}%` }} />
                  </div>
                  <span className="mgr-bar-value">
                    {c.completed}/{c.total} · {c.pct}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Деталізація попереднього блоку на рівень нижче: курс → модуль.
            Єдине місце на дашборді, що доводить погану цифру до конкретної
            ТЕМИ, а не до людини чи курсу цілком. Подвійної ширини з тієї ж
            причини, що й "% складання по курсу" — назви модулів довгі. */}
        <div className="mgr-chart-card mgr-chart-card-wide">
          <h2>
            <CourseIcon /> Найскладніші модулі
            <ChartHint text="Модулі, які команда найчастіше провалює — за кількістю людей, що не набрали прохідний бал модуля. Сортування за кількістю провалів, а не за відсотком: «1 з 1» дало б 100% і витіснило б реально проблемний «3 з 8». Модулі без жодного провалу в список не потрапляють." />
          </h2>
          {stats.hardestModules.length === 0 ? (
            <p className="admin-hint">Жоден модуль не провалено — складних місць поки немає.</p>
          ) : (
            <ul className="mgr-bar-list">
              {stats.hardestModules.map((m) => (
                <li key={`${m.course}-${m.title}`} className="mgr-bar-row">
                  {/* Назва модуля + курс ДВОМА рядками, а не одним через
                      "·" з біжучим рядком, як у курсів вище: "модуль ·
                      курс" удвічі довше за просту назву курсу й у ту саму
                      колонку не влазить — MarqueeText там починав
                      прокручувати кожен рядок, і список читався як
                      зламаний. */}
                  <span className="mgr-bar-label mgr-bar-label-stack">
                    <span className="mgr-bar-label-main">{m.title}</span>
                    {m.course ? <span className="mgr-bar-label-sub">{m.course}</span> : null}
                  </span>
                  <div className="mgr-bar-track">
                    <div
                      className="mgr-bar-fill mgr-bar-fill-alert"
                      style={{ width: `${barsAnimated ? m.pct : 0}%` }}
                    />
                  </div>
                  <span className="mgr-bar-value">
                    {m.failed}/{m.total} · {m.pct}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mgr-section">
        <div className="mgr-team-header">
          <h2>
            <PeopleIcon /> Детально по команді
          </h2>
          <div className="mgr-team-controls">
            <select className="admin-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select className="admin-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              className="admin-input-flex mgr-team-search"
              placeholder="Пошук за ім'ям…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {flatTeam.length === 0 ? (
          <p className="admin-hint">У вас немає підлеглих.</p>
        ) : filteredFlat && filteredFlat.length === 0 ? (
          <p className="admin-hint">Нікого не знайдено.</p>
        ) : (
          <ul className="mgr-team-tree">
            {visibleNodes.map((node) => (
              <TeamNode key={node.id} node={node} summaryByEmployeeId={summaryByEmployeeId} ratingByEmployeeId={rating.byEmployeeId} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
