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
  SpinnerIcon,
} from "@/components/icons";
import { medalTier } from "@/lib/progress";
import { ProfileCard } from "@/components/ProfileCard";
import { MarqueeText } from "@/components/MarqueeText";

const STATUS_META = {
  not_started: { label: "Не розпочато", cls: "mgr-pill-neutral" },
  in_progress: { label: "В процесі", cls: "mgr-pill-alert" },
  overdue: { label: "Прострочено", cls: "mgr-pill-fail" },
};

// status="completed" саме по собі означає лише "пройшов до кінця" —
// НЕ "склав". Прохідний бал 80% (той самий поріг, що вже рахує
// passed = scorePercent >= 80 при генерації даних) — completed з
// passed:false мусить бути червоним "Не складено", а не зеленим
// "Завершено", інакше провалений курс візуально виглядає як успіх.
function StatusPill({ status, passed }) {
  if (status === "completed") {
    return passed ? (
      <span className="mgr-pill mgr-pill-success">Складено</span>
    ) : (
      <span className="mgr-pill mgr-pill-fail">Не складено</span>
    );
  }
  const meta = STATUS_META[status] || STATUS_META.not_started;
  return <span className={`mgr-pill ${meta.cls}`}>{meta.label}</span>;
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
        <MarqueeText className="mgr-enrollment-title">{enrollment.course.title}</MarqueeText>
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
        {/* 🎯 — той самий emoji, що й "Без помилок" в AchievementsPanel
            (уже усталений у проєкті знак влучності/серії) — той самий
            "страйк"-рейт (streak), що й мотиваційні тости в плеєрі:
            найдовша серія поспіль правильних відповідей за спробу
            (Enrollment.longestCorrectStreak). */}
        {enrollment.longestCorrectStreak > 0 && (
          <span className="mgr-stat-chip" title="Найдовша серія поспіль правильних відповідей">
            🎯 {enrollment.longestCorrectStreak} поспіль
          </span>
        )}
        {/* Медаль за той самий бал, що вже показаний вище — золото/срібло/
            бронза за порогом (100% / 95%+ / 90%+), той самий принцип, що
            й BowlingPinIcon→🎯: наочний символ поруч із цифрою. */}
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
      {enrollment.modules && enrollment.modules.length > 0 && (
        <ul className="mgr-module-list">
          {enrollment.modules.map((m) => (
            <li key={m.id} className={`mgr-module-row${m.passed === true ? " is-pass" : m.passed === false ? " is-fail" : " is-pending"}`}>
              <span className="mgr-module-status-icon">
                {m.passed === true ? <CheckIcon /> : m.passed === false ? <XIcon /> : <span className="mgr-module-dot" aria-hidden="true" />}
              </span>
              <MarqueeText className="mgr-module-title">{m.title}</MarqueeText>
              {m.scorePercent != null && <span className="mgr-module-score">{m.scorePercent}%</span>}
              {m.longestCorrectStreak > 0 && (
                <span className="mgr-module-streak" title="Найдовша серія поспіль правильних відповідей у цьому модулі">
                  🎯 {m.longestCorrectStreak}
                </span>
              )}
              {medalTier(m.scorePercent) && (
                <span className="mgr-module-medal" title={`${m.scorePercent}% — медаль за модуль`}>
                  <MedalIcon tier={medalTier(m.scorePercent)} />
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
                  <span className={a.passed ? "mgr-attempt-pass" : "mgr-attempt-fail"}>{a.passed ? "Складено" : "Не складено"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function TeamNode({ node, summaryByEmployeeId }) {
  const [showChildren, setShowChildren] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);

  const summary = summaryByEmployeeId[node.id];
  const hasChildren = node.children && node.children.length > 0;

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
              {summary.avgScore != null && <span className="mgr-badge mgr-badge-score">{summary.avgScore}%</span>}
              {summary.overdue > 0 && <span className="mgr-badge mgr-badge-overdue">{summary.overdue} прострочено</span>}
            </div>
          </div>
        )}
      </div>

      {showDetail && (
        <div className="mgr-team-detail">
          {detailLoading && (
            <p className="admin-hint">
              <SpinnerIcon />
              Завантаження…
            </p>
          )}
          {detailError && <p className="admin-hint">Не вдалося завантажити.</p>}
          {detail && detail.length === 0 && <p className="admin-hint">Курсів не призначено.</p>}
          {detail && detail.length > 0 && (
            <ul className="mgr-enrollment-list">
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
            <TeamNode key={child.id} node={child} summaryByEmployeeId={summaryByEmployeeId} />
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

function sortByOverdueFirst(nodes, summaryByEmployeeId) {
  return nodes
    .slice()
    .sort((a, b) => (summaryByEmployeeId[b.id]?.overdue || 0) - (summaryByEmployeeId[a.id]?.overdue || 0));
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
        <p className="admin-subtitle">
          <SpinnerIcon />
          Завантаження…
        </p>
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
  const { stats, summaryByEmployeeId, tree, weeklyTrend } = team;
  const trendMax = Math.max(1, ...weeklyTrend.map((w) => w.count));
  const visibleNodes = filteredFlat ?? sortByOverdueFirst(tree, summaryByEmployeeId);

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

      <ProfileCard dbName={me.name} hasEmail={me.hasEmail} externalCode={me.externalCode} levelLabel={me.levelLabel} />

      <div className="mgr-kpi-row">
        <div className="mgr-kpi-tile">
          <b>{stats.teamSize}</b>
          <span>у команді</span>
        </div>
        <div className="mgr-kpi-tile">
          <b>{stats.avgScore != null ? `${stats.avgScore}%` : "—"}</b>
          <span>середній бал</span>
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
          <h2>Показники команди</h2>
          <div className="mgr-ring-grid">
            <CompletionRing pct={stats.completionRate} label="Виконано" color="var(--cb-secondary)" />
            <CompletionRing pct={stats.passRate} label="Складено (80%+)" color="var(--green-700)" />
            <CompletionRing pct={stats.onTimeRate} label="Вчасно" color="var(--cb-notification)" />
            <CompletionRing pct={stats.engagementRate} label="Розпочали" color="var(--cb-tertiary)" />
          </div>
        </div>

        {/* Тренд по тижнях — коротко: к-сть складених модулів за останні
            6 тижнів (реальні дати ModuleCompletion.completedAt, без
            окремої "знімкової" інфраструктури — див. lib/managerDashboard.js
            getWeeklyTrend). */}
        <div className="mgr-chart-card mgr-trend-card">
          <h2>
            <CalendarIcon /> Активність по тижнях
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
      </section>

      {/* % виконання по курсу — на всю ширину (не третьою карткою поруч
          з кільцями/трендом): назви курсів довгі, вузька колонка й так
          вимагала біжучого рядка для кожної, а повна ширина дає бару
          реально показати пропорцію без урізання. */}
      <section className="mgr-section">
        <div className="mgr-chart-card">
          <h2>
            <TrendIcon /> % виконання по курсу
          </h2>
          {stats.courseBreakdown.length === 0 ? (
            <p className="admin-hint">Немає даних.</p>
          ) : (
            <ul className="mgr-bar-list">
              {stats.courseBreakdown.map((c) => (
                <li key={c.title} className="mgr-bar-row">
                  <MarqueeText className="mgr-bar-label">{c.title}</MarqueeText>
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
      </section>

      <section className="mgr-section">
        <div className="mgr-team-header">
          <h2>
            <PeopleIcon /> Моя команда
          </h2>
          <div className="mgr-team-controls">
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
              <TeamNode key={node.id} node={node} summaryByEmployeeId={summaryByEmployeeId} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
