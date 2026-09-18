"use client";

import { cloneElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  DashboardTuneIcon,
  ExcelIcon,
  ArrowsMoveIcon,
} from "@/components/icons";
import { HintDot } from "@/components/HintDot";
import { CompletionRing } from "@/components/CompletionRing";
import { medalTier } from "@/lib/progress";
import { PageSkeleton, LinesSkeleton } from "@/components/Skeleton";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { ProfileCard } from "@/components/ProfileCard";
import { MarqueeText } from "@/components/MarqueeText";
import { ManagerDashboardSettings } from "@/components/ManagerDashboardSettings";

// localStorage, не БД (рішення користувача, 2026-09-19) — вибір карток
// живе лише в цьому браузері, на іншому пристрої дашборд знову стартує з
// ролевого дефолту нижче. v1 — щоб можна було безпечно змінити формат, не
// читаючи старий несумісний масив як валідний.
const DASHBOARD_CARDS_STORAGE_KEY = "carls_manager_dashboard_cards_v1";

// Дефолт при ПЕРШОМУ заході (нема запису в localStorage — keeper сам
// нічого не вмикав/вимикав) залежить від посади: Position.code (lib/
// permissions.js isManagerTier — SV/ASM/RM_HORECA і головні HR/маркетинг/
// виробництва теж manager-tier). Реальних посад "T&D" у базі нема
// (lib/employeeDepartments.js — лише Продажі/Виробництво/HR/Маркетинг),
// тож набір, який користувач попросив для "T&D", тут — дефолт для УСІХ
// НЕ-SV/НЕ-ASM керівників (RM, голови HR/маркетингу/виробництва): saме
// вони дивляться на команду згори, без щоденної роботи з конкретними
// людьми — той самий "зверху вниз, якість контенту" погляд.
const ROLE_DEFAULT_CARDS = {
  SV: ["rings", "deadlines", "scoreDist", "peopleStatus"],
  ASM: ["rings", "deadlines", "scoreDist", "peopleStatus"],
};
const FALLBACK_ROLE_DEFAULT_CARDS = [
  "rings",
  "deadlines",
  "hardestModules",
  "trend",
  "courseBreakdown",
  "firstTry",
  "duration",
  "hardestQuestions",
];

function roleDefaultCards(positionCode) {
  return new Set(ROLE_DEFAULT_CARDS[positionCode] || FALLBACK_ROLE_DEFAULT_CARDS);
}

// null (а не одразу дефолтний Set) — щоб відрізнити "керівник ще нічого не
// обирав" від "обрав саме дефолтний набір": лише в першому випадку дашборд
// підставляє ролевий дефолт (roleDefaultCards) замість збереженого вибору.
function readStoredCards() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DASHBOARD_CARDS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : null;
  } catch {
    return null;
  }
}

// Порядок карток — окремий ключ від видимості: людина може перетягнути
// картку, жодної не вимикаючи, і навпаки. Теж лише localStorage (рішення
// користувача, 2026-09-19).
const DASHBOARD_ORDER_STORAGE_KEY = "carls_manager_dashboard_order_v1";
// Скільки тримати палець/кнопку на картці, щоб увімкнувся режим
// перетягування — як довге натискання на іконку в iOS.
const LONG_PRESS_MS = 450;
// Рух далі цього порога до спрацювання таймера — це скрол або виділення
// тексту, а не намір тягнути: довге натискання скасовується.
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

// Ширина картки в "слотах" (1..4). Слот — умовна колонка ~230px: саме
// стільки картка просить як базову ширину, а решту вільного місця в рядку
// ділить пропорційно кількості слотів. Тобто число задає НЕ жорсткі
// пікселі, а частку — рядки й далі заповнюються без дір, як домовлялись.
const DASHBOARD_SPANS_STORAGE_KEY = "carls_manager_dashboard_spans_v1";
const SPAN_SLOT_BASIS_PX = 230;
const SPAN_SLOT_GAP_PX = 20;
const MAX_CARD_SPAN = 4;
// Скільки треба протягнути ручку, щоб додати/відняти слот.
const SPAN_STEP_PX = SPAN_SLOT_BASIS_PX + SPAN_SLOT_GAP_PX;

// Висота картки — окремий ключ від ширини: ширина задається в слотах
// (частка рядка), а висота — у пікселях, кроком по сітці. Застосовується
// як min-height, а НЕ height: так картка ніколи не обріже власний вміст
// (правило "нічого не виходить за контейнер"), лише стане вищою за
// природну висоту, якщо керівник так хоче.
const DASHBOARD_HEIGHTS_STORAGE_KEY = "carls_manager_dashboard_heights_v1";
const HEIGHT_STEP_PX = 20;
// Кільце (CompletionRing): звичайний розмір і межа, нижче якої відсоток
// усередині вже не прочитати.
const RING_MAX_PX = 108;
const RING_MIN_PX = 54;
const MAX_CARD_HEIGHT_PX = 900;
// Наскільки можна зрушити вказівник, щоб це все ще вважалось кліком, а не
// перетягуванням.
const CLICK_SLOP_PX = 6;

function readStoredHeights() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DASHBOARD_HEIGHTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function spanFlexStyle(span) {
  const basis = span * SPAN_SLOT_BASIS_PX + (span - 1) * SPAN_SLOT_GAP_PX;
  return { flexGrow: span, flexShrink: 1, flexBasis: `min(100%, ${basis}px)` };
}

function readStoredSpans() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DASHBOARD_SPANS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readStoredOrder() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DASHBOARD_ORDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Збережений порядок + канонічний (порядок карток у розмітці): спершу те,
 * що людина сама розставила, далі — картки, яких у збереженому списку ще
 * нема. Без цього нова картка, додана в код пізніше, просто не показалась
 * би тим, хто колись щось перетягував.
 */
function mergeCardOrder(stored, canonical) {
  if (!stored) return canonical;
  const known = new Set(canonical);
  const ordered = stored.filter((id) => known.has(id));
  const placed = new Set(ordered);
  return [...ordered, ...canonical.filter((id) => !placed.has(id))];
}

// Порядок карток у розмітці (нижче в цьому файлі) — база, від якої
// рахується збережений порядок. Список тут, а не зібраний із самої
// розмітки, бо React забороняє читати/писати ref під час рендера, а
// порядок потрібен ще до того, як картки зібрані в масив. Якщо в розмітці
// колись з'явиться картка, якої тут нема, renderChartCards допише її в
// кінець — дашборд не "втратить" її мовчки.
const CANONICAL_CARD_IDS = [
  "rings",
  "trend",
  "deadlines",
  "scoreDist",
  "firstTry",
  "duration",
  "courseBreakdown",
  "hardestModules",
  "peopleStatus",
  "teamCompare",
  "hardestQuestions",
];

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
  // Явний вибір керівника (localStorage) — поки його нема, дашборд рахує
  // дефолт із посади (roleDefaultCards) щоразу заново з state.data, а не
  // застигає на дефолті, порахованому до того, як /api/manager/overview
  // взагалі відповів.
  const [cardOverride, setCardOverride] = useState(readStoredCards);
  const enabledCards = cardOverride ?? roleDefaultCards(state.data?.me?.position?.code);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // "Найскладніші питання" — єдина з нових карток, що рахується окремим
  // запитом (lib/managerDashboard.js getHardestQuestions), а не з уже
  // завантаженого /api/manager/overview: вимкнена за замовчуванням, тож
  // зайвий запит до бази не повинен виконуватись, поки керівник сам її
  // не увімкнув.
  const [hardestQuestions, setHardestQuestions] = useState({ loading: false, items: null, error: false });
  // "Запит уже пішов" — саме ref, а не стан: стан у залежностях ефекту
  // перезапускав би його сам на себе (див. коментар при ефекті нижче).
  const hardestQuestionsRequestedRef = useRef(false);
  // Перетягування карток (як іконки на iPhone): режим редагування, id
  // картки в руці та її зсув відносно точки захоплення.
  const [storedOrder, setStoredOrder] = useState(readStoredOrder);
  // Ширини, які керівник сам поставив ручкою (id -> слоти). Поки картки
  // тут нема — діє ширина з розмітки/CSS, тож дашборд у всіх, хто нічого
  // не тягнув, виглядає рівно як раніше.
  const [cardSpans, setCardSpans] = useState(readStoredSpans);
  const [cardHeights, setCardHeights] = useState(readStoredHeights);
  const [resizeId, setResizeId] = useState(null);
  const resizeRef = useRef(null);
  // Картки, у яких вміст НЕ доходить до низу (є куди тягнути висоту).
  // Тільки їм показуємо нижню ручку: на картці, де вміст уже впирається
  // в край, тягнути було нікуди — ручка стояла мертва (скарга
  // користувача). Поруч тримаємо "природну" висоту кожної картки — нижче
  // за неї ряд стискати не можна, інакше вміст обріжеться.
  const [slackCardIds, setSlackCardIds] = useState(() => new Set());
  // Дві різні "природні" висоти картки:
  //  • naturalHeightsRef — СТИСНУТА (кільце в мінімумі) = жорстка підлога,
  //    нижче якої вміст почав би обрізатись;
  //  • fullHeightsRef — ЗВИЧАЙНА (кільце в повний розмір) = висота, на якій
  //    ручна висота вже не потрібна, запис можна прибрати.
  // Без другої картка з кільцем "відпружинювала": щойно висота доходила до
  // стиснутої підлоги, запис вважався зайвим, кільце розгорталось назад — і
  // картка знову ставала високою.
  const naturalHeightsRef = useRef(new Map());
  const fullHeightsRef = useRef(new Map());
  const [editMode, setEditMode] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const longPressRef = useRef(null);
  // Остання картка, з якою вже помінялись місцями. Без цього кожен
  // наступний pointermove над ТІЄЮ САМОЮ карткою міняв порядок знову й
  // знову: після обміну ціль з'їжджає під той самий курсор, і пара
  // смикалась туди-сюди десятки разів за секунду.
  const lastSwapTargetRef = useRef(null);
  // Позиції карток ДО останньої зміни порядку — для FLIP-анімації нижче
  // (виміряти старе → перерендерити → доїхати з різниці в нуль).
  const cardRectsRef = useRef(new Map());

  function toggleCard(id) {
    const next = new Set(enabledCards);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    try {
      window.localStorage.setItem(DASHBOARD_CARDS_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // localStorage недоступний (приватний режим тощо) — вибір просто
      // не переживе перезавантаження сторінки, не критично.
    }
    setCardOverride(next);
  }

  // ---- Перетягування карток (режим редагування, як іконки в iOS) ----
  // Порядок рахується від канонічного (CANONICAL_CARD_IDS); збережений
  // лише перекриває його.
  const orderedIds = useMemo(() => mergeCardOrder(storedOrder, CANONICAL_CARD_IDS), [storedOrder]);
  const orderKey = orderedIds.join("|");

  function persistOrder(next) {
    setStoredOrder(next);
    try {
      window.localStorage.setItem(DASHBOARD_ORDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Те саме, що й з видимістю: без localStorage порядок просто не
      // переживе перезавантаження.
    }
  }

  function persistSpans(next) {
    setCardSpans(next);
    try {
      window.localStorage.setItem(DASHBOARD_SPANS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Як і з рештою налаштувань дашборда — без localStorage просто не
      // переживе перезавантаження.
    }
  }

  function persistHeights(next) {
    setCardHeights(next);
    try {
      window.localStorage.setItem(DASHBOARD_HEIGHTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Як і решта налаштувань дашборда.
    }
  }

  /**
   * Стеля розміру кільця (--mgr-ring-max) із реально доступної висоти
   * усередині картки. Без неї кільце лишалось би 108px і задавало картці
   * жорсткий мінімум висоти — ряд не стискався б навіть удвічі.
   * RING_MIN_PX — нижче кільце вже нечитабельне (цифра всередині).
   */
  function applyRingCaps() {
    for (const card of document.querySelectorAll("[data-card-id]")) {
      const rings = [...card.querySelectorAll(".mgr-ring")];
      if (rings.length === 0) continue;
      const setCap = (px) => rings.forEach((ring) => ring.style.setProperty("--mgr-ring-max", `${px}px`));
      // Скільки картка займає САМА ПО СОБІ (без нав'язаної висоти: ані
      // ручної, ані розтягнутої сусідом по рядку) при найменшому й при
      // звичайному кільці. Різниця — це "ціна" повного кільця у висоті.
      const savedAlignSelf = card.style.alignSelf;
      const savedMinHeight = card.style.minHeight;
      const savedHeight = card.style.height;
      card.style.alignSelf = "flex-start";
      card.style.minHeight = "";
      card.style.height = "";
      // offsetHeight — з тієї ж причини, що й у замірі підлоги: у режимі
      // редагування картка повернута анімацією, і rect бреше.
      setCap(RING_MIN_PX);
      const atMin = card.offsetHeight;
      setCap(RING_MAX_PX);
      const atMax = card.offsetHeight;
      card.style.alignSelf = savedAlignSelf;
      card.style.minHeight = savedMinHeight;
      card.style.height = savedHeight;
      // Фактична висота картки в розкладці (уже з урахуванням ручної
      // висоти й вирівнювання рядка) — скільки місця реально є.
      const actual = card.offsetHeight;
      const ringRoom = atMax - atMin;
      if (ringRoom <= 0) {
        setCap(RING_MAX_PX);
        continue;
      }
      const share = Math.max(0, Math.min(1, (actual - atMin) / ringRoom));
      let cap = Math.round(RING_MIN_PX + (RING_MAX_PX - RING_MIN_PX) * share);
      setCap(cap);
      // Перевірка ділом: пропорція вище — оцінка, а у flex із переносом
      // (кільце + легенда поруч) висота рядка може стрибнути не так, як
      // очікувалось. Тому зменшуємо кільце доти, доки вміст справді не
      // вміститься — краще трохи менше кільце, ніж обрізаний вміст.
      for (let i = 0; i < 8 && cap > RING_MIN_PX && card.scrollHeight > card.clientHeight + 1; i++) {
        cap = Math.max(RING_MIN_PX, cap - 8);
        setCap(cap);
      }
    }
  }

  /** Картки одного візуального ряду — у flex-wrap це ті, що стоять на
   * тій самій вертикалі (offsetTop). Висота міняється саме рядком:
   * сусіди в ряду й так завжди однакової висоти (align-items:stretch),
   * тож тягнути "лише цю картку" було б ілюзією. */
  function rowCardIds(id) {
    const el = document.querySelector(`[data-card-id="${id}"]`);
    if (!el) return [id];
    const top = el.offsetTop;
    return [...document.querySelectorAll("[data-card-id]")]
      .filter((node) => Math.abs(node.offsetTop - top) < 4)
      .map((node) => node.getAttribute("data-card-id"));
  }

  function resetLayout() {
    setStoredOrder(null);
    setCardSpans({});
    setCardHeights({});
    try {
      window.localStorage.removeItem(DASHBOARD_ORDER_STORAGE_KEY);
      window.localStorage.removeItem(DASHBOARD_SPANS_STORAGE_KEY);
      window.localStorage.removeItem(DASHBOARD_HEIGHTS_STORAGE_KEY);
    } catch {
      // Немає localStorage — стан у пам'яті все одно скинуто.
    }
  }

  // Дві ручки: на правому краю — ширина (кроком у слот), на нижньому —
  // висота (кроком по сітці). Одна вісь на ручку, а не кутовий "хапок"
  // одразу по двох: на дашборді майже завжди треба щось одне, і по одній
  // осі промахнутись важче (той самий підхід, що в Grafana/Datadog для
  // окремих країв плитки).
  function handleResizePointerDown(e, id, defaultSpan, axis) {
    e.stopPropagation(); // інакше секція почне перетягувати саму картку
    const cardEl = e.currentTarget.closest("[data-card-id]");
    resizeRef.current = {
      id,
      axis,
      startX: e.clientX,
      startY: e.clientY,
      startSpan: cardSpans[id] ?? defaultSpan,
      startHeight: cardHeights[id] ?? Math.round(cardEl?.getBoundingClientRect().height ?? 0),
      rowIds: axis === "y" ? rowCardIds(id) : [id],
    };
    setResizeId(id);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Той самий випадок, що й у startDrag: без захоплення події просто
      // приходитимуть на документ — зміна розміру від цього не ламається.
    }
  }

  function handleResizePointerMove(e) {
    const resize = resizeRef.current;
    if (!resize) return;
    if (resize.axis === "y") {
      const raw = resize.startHeight + (e.clientY - resize.startY);
      const snapped = Math.min(MAX_CARD_HEIGHT_PX, Math.round(raw / HEIGHT_STEP_PX) * HEIGHT_STEP_PX);
      // Нижня межа — найвищий ВМІСТ у цьому ряду: нижче ряд стискати
      // нікуди, інакше довгий список обрізало б. Тому тягнути вгору можна
      // рівно до природної висоти ряду, не далі.
      const floor = Math.max(
        HEIGHT_STEP_PX,
        ...resize.rowIds.map((rowId) => naturalHeightsRef.current.get(rowId) ?? 0)
      );
      // Висота, на якій ручна висота вже нічого не змінює (вміст у
      // звичайному розмірі). Усе, що нижче за неї, ЗБЕРІГАЄМО як власну
      // висоту — інакше стиснута картка з кільцем розгорталась би назад.
      const fullNatural = Math.max(
        floor,
        ...resize.rowIds.map((rowId) => fullHeightsRef.current.get(rowId) ?? 0)
      );
      const height = Math.max(floor, snapped);
      const next = { ...cardHeights };
      for (const rowId of resize.rowIds) {
        if (height >= fullNatural) delete next[rowId];
        else next[rowId] = height;
      }
      if (JSON.stringify(next) === JSON.stringify(cardHeights)) return;
      persistHeights(next);
      return;
    }
    const steps = Math.round((e.clientX - resize.startX) / SPAN_STEP_PX);
    const nextSpan = Math.min(MAX_CARD_SPAN, Math.max(1, resize.startSpan + steps));
    if (nextSpan === (cardSpans[resize.id] ?? resize.startSpan)) return;
    persistSpans({ ...cardSpans, [resize.id]: nextSpan });
  }

  function handleResizePointerUp() {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    setResizeId(null);
  }

  function moveCardBefore(id, overId) {
    const from = orderedIds.indexOf(id);
    const to = orderedIds.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return;
    const next = orderedIds.filter((x) => x !== id);
    // Тягнемо вниз — стаємо ПІСЛЯ картки, над якою відпустили; вгору —
    // перед нею. Інакше картка "перестрибує" ціль на одну позицію.
    next.splice(next.indexOf(overId) + (from < to ? 1 : 0), 0, id);
    persistOrder(next);
  }

  function startDrag(target, id, clientX, clientY, pointerId) {
    // pressX/pressY — точка натискання, яку НЕ переприв'язуємо при зміні
    // порядку (на відміну від startX/startY): за нею відрізняємо клік від
    // перетягування на pointerup.
    dragRef.current = { id, startX: clientX, startY: clientY, pressX: clientX, pressY: clientY, moved: false };
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // setPointerCapture кидає, якщо вказівник уже відпущено — тоді
      // просто тягнемо без захоплення, події й так прийдуть на документ.
    }
    setDragId(id);
    setDragDelta({ x: 0, y: 0 });
  }

  function cancelLongPress() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
  }

  // Обробники висять на самій секції (делегування), а не на кожній картці:
  // так renderChartCards лишається чистою функцією розмітки й не чіпає
  // refs під час рендера (react-hooks/refs), а захоплення вказівника
  // (setPointerCapture) живе на одному стабільному елементі — картка під
  // пальцем може перемикатись, секція ні.
  function handleCardPointerDown(e) {
    const id = e.target?.closest?.("[data-card-id]")?.getAttribute("data-card-id");
    if (!id) return;
    // Тільки основна кнопка миші / дотик — правою кнопкою тягати нічого.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (editMode) {
      startDrag(e.currentTarget, id, e.clientX, e.clientY, e.pointerId);
      return;
    }
    // Довге натискання вмикає режим редагування І одразу бере картку —
    // один жест, як на телефоні.
    const target = e.currentTarget;
    const { clientX, clientY, pointerId } = e;
    const timer = setTimeout(() => {
      longPressRef.current = null;
      setEditMode(true);
      startDrag(target, id, clientX, clientY, pointerId);
    }, LONG_PRESS_MS);
    longPressRef.current = { timer, startX: clientX, startY: clientY };
  }

  function handleCardPointerMove(e) {
    const drag = dragRef.current;
    if (!drag) {
      // Рух далі допуску до спрацювання таймера — це скрол/виділення
      // тексту, а не намір тягнути.
      const pending = longPressRef.current;
      if (
        pending &&
        Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) > LONG_PRESS_MOVE_TOLERANCE_PX
      ) {
        cancelLongPress();
      }
      return;
    }
    if (!drag.moved && Math.hypot(e.clientX - drag.pressX, e.clientY - drag.pressY) > CLICK_SLOP_PX) {
      drag.moved = true;
    }
    setDragDelta({ x: e.clientX - drag.startX, y: e.clientY - drag.startY });
    // Картка під вказівником. Сама взята картка має pointer-events:none
    // (CSS .is-dragging), тож elementFromPoint бачить те, що ПІД нею.
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const overId = under?.closest?.("[data-card-id]")?.getAttribute("data-card-id");
    if (!overId || overId === drag.id) {
      // Вийшли в порожнечу або на себе — наступний захід на ту саму
      // картку знову дозволено.
      lastSwapTargetRef.current = null;
      return;
    }
    if (overId === lastSwapTargetRef.current) return;
    lastSwapTargetRef.current = overId;
    moveCardBefore(drag.id, overId);
  }

  function handleCardPointerUp() {
    cancelLongPress();
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragId(null);
    setDragDelta({ x: 0, y: 0 });
    // Клік (без руху) по самій картці виходить із режиму — як і клік повз
    // картки (запит користувача). Перетягування, звісно, режим лишає.
    if (!drag.moved) setEditMode(false);
  }

  /**
   * Приймає пари [id, вузол] у канонічному порядку, повертає їх у порядку
   * керівника, підмішуючи в кожну картку обробники перетягування.
   * cloneElement — щоб не переписувати розмітку всіх 11 карток: вони
   * лишаються там, де й були, просто отримують ще кілька пропсів.
   */
  function renderChartCards(entries) {
    const visible = entries.filter(([, node]) => node);
    const byId = new Map(visible);
    const known = new Set(orderedIds);
    // Картка з розмітки, якої нема в CANONICAL_CARD_IDS (забули дописати) —
    // у кінець, але на екран: мовчки зникати вона не має.
    const ordered = [...orderedIds, ...visible.map(([id]) => id).filter((id) => !known.has(id))];
    return ordered.map((id) => {
      const node = byId.get(id);
      if (!node) return null;
      const isDragging = dragId === id;
      // Дефолт слотів — з розмітки: широкі картки (mgr-chart-card-wide)
      // це 2 слоти, решта 1. Поки керівник не тягнув ручку, інлайнового
      // стилю нема взагалі й ширину задає CSS, як і до цієї фічі.
      const defaultSpan = node.props.className.includes("mgr-chart-card-wide") ? 2 : 1;
      const span = cardSpans[id];
      // Хрестик у режимі перетягування — той самий жест, що прибирає
      // іконку з екрана iPhone: знімає галочку видимості цієї картки
      // (той самий toggleCard, що й чекбокс у шторці налаштувань, тож
      // повернути її можна там же).
      const removeButton = editMode ? (
        <button
          key="mgr-card-remove"
          type="button"
          className="mgr-card-remove"
          aria-label="Прибрати картку з дашборда"
          title="Прибрати з дашборда (повернути — у налаштуваннях карток)"
          // Без цього pointerdown дійшов би до секції й почав перетягування
          // замість натискання кнопки.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => toggleCard(id)}
        >
          <XIcon />
        </button>
      ) : null;
      const resizeHandles = editMode
        ? [
            <span
              key="mgr-card-resize-x"
              className="mgr-card-resize mgr-card-resize-x"
              role="separator"
              aria-orientation="vertical"
              aria-label="Змінити ширину картки"
              title="Потягніть, щоб зробити картку ширшою або вужчою"
              onPointerDown={(e) => handleResizePointerDown(e, id, defaultSpan, "x")}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={handleResizePointerUp}
            />,
            // Нижня ручка — лише де є запас або де висоту вже задали
            // вручну (щоб свою ж зміну можна було відкотити). На картці,
            // чий вміст і так упирається в край, тягнути нікуди — там
            // ручка була б мертвою.
            slackCardIds.has(id) || cardHeights[id] ? (
              <span
                key="mgr-card-resize-y"
                className="mgr-card-resize mgr-card-resize-y"
                role="separator"
                aria-orientation="horizontal"
                aria-label="Змінити висоту ряду"
                title="Потягніть, щоб змінити висоту ряду (нижче за вміст не стиснеться)"
                onPointerDown={(e) => handleResizePointerDown(e, id, defaultSpan, "y")}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerUp}
                onPointerCancel={handleResizePointerUp}
              />
            ) : null,
          ]
        : null;
      return cloneElement(
        node,
        {
          key: id,
          "data-card-id": id,
          className: `${node.props.className}${editMode ? " is-editable" : ""}${isDragging ? " is-dragging" : ""}${
            resizeId === id ? " is-resizing" : ""
          }`,
          style: {
            ...(span ? spanFlexStyle(span) : null),
            // height І min-height разом: сама min-height картку НЕ
            // стискає (вміст із повнорозмірним кільцем усе одно тримав би
            // її вищою), а height задає рівно ту висоту, яку вибрав
            // керівник — кільце під неї підлаштується (applyRingCaps).
            // Значення вже обмежене стиснутою підлогою, тож вміст не
            // обріжеться.
            ...(cardHeights[id] ? { height: `${cardHeights[id]}px`, minHeight: `${cardHeights[id]}px` } : null),
            ...(isDragging ? { transform: `translate(${dragDelta.x}px, ${dragDelta.y}px)` } : null),
          },
        },
        node.props.children,
        removeButton,
        resizeHandles
      );
    });
  }

  // Міряємо, де в картці лишається вільне місце під вмістом. Саме цим
  // вирішується, показувати нижню ручку чи ні: тягнути висоту має сенс
  // лише там, де є запас ("З першої спроби", кільця), а не там, де вміст
  // уже впирається в край (довгі списки).
  const spansKey = JSON.stringify(cardSpans);
  const heightsKey = JSON.stringify(cardHeights);
  // Зміна ширини вікна теж робить збережену висоту замалою (підписи
  // переносяться, картки міняють ширину) — тоді перемірюємо й підтягуємо.
  // Лічильник просто "штовхає" ефект нижче, власної логіки не має.
  const [viewportTick, setViewportTick] = useState(0);
  useEffect(() => {
    let timer = 0;
    function onResize() {
      // setTimeout, а не requestAnimationFrame: rAF не виконується, поки
      // сторінку не малюють (фонова вкладка, згорнуте вікно) — а перевірити
      // висоти після зміни розміру треба саме тоді, коли на сторінку
      // повернуться. Таймер зрештою спрацює в будь-якому разі.
      clearTimeout(timer);
      timer = setTimeout(() => setViewportTick((n) => n + 1), 120);
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, []);
  useLayoutEffect(() => {
    // Рахуємо ЗАВЖДИ, не лише в режимі редагування: збережена висота могла
    // стати замалою після зміни ширини вікна чи набору карток — тоді вміст
    // вивалюється за картку (скарга користувача: рядок "100%" у "Розподілі
    // балів" опинився під карткою). Нижче така висота підтягується до
    // мінімально можливої.
    if (!state.data) return;
    // IIFE, а не прямий виклик setState у тілі ефекту — той самий прийом,
    // що й у ефекті hardestQuestions вище (react-hooks/set-state-in-effect).
    (() => {
      const nodes = [...document.querySelectorAll("[data-card-id]")];
      // Синхронно знімаємо ручну висоту з УСІХ карток одразу (без цього
      // якщо картку вже розтягли раніше, її вміст, центрований у флекс-
      // обгортці, ЗАРАЗ стоїть нижче — і наступний замір "природної"
      // висоти сам поповз би слідом за попереднім розтягуванням, звужити
      // назад ставало б неможливо: "підлога" щоразу росла разом зі
      // стелею). Читання getBoundingClientRect одразу після зняття
      // форсує reflow ДО того, як браузер щось намалює (немає await/RAF
      // між зняттям і поверненням стилю) — проміжний нерозтягнутий кадр
      // ніхто не бачить.
      // Фактична висота ДО того, як приберемо нав'язані розміри — з нею
      // порівнюємо "стиснуту" висоту нижче.
      const actualHeight = new Map(nodes.map((node) => [node.getAttribute("data-card-id"), node.offsetHeight]));
      const savedMinHeight = nodes.map((node) => node.style.minHeight);
      const savedHeight = nodes.map((node) => node.style.height);
      nodes.forEach((node) => {
        node.style.minHeight = "";
        node.style.height = "";
      });
      // Кільця на час заміру — у найменший дозволений розмір: "природна"
      // висота картки з кільцем має означати "наскільки вона МОЖЕ
      // стиснутись", а не "скільки займає кільце зараз". Інакше підлога
      // рахувалась би по 108px і картку не вийшло б зробити вдвічі
      // нижчою, хоча кільце це дозволяє. Після заміру applyRingCaps()
      // нижче поверне кільцям розмір під реально доступне місце.
      const rings = [...document.querySelectorAll(".mgr-ring")];
      const savedRingCap = rings.map((ring) => ring.style.getPropertyValue("--mgr-ring-max"));
      rings.forEach((ring) => {
        ring.style.setProperty("--mgr-ring-max", `${RING_MIN_PX}px`);
      });
      // Власна висота картки, коли її ніщо не тримає: ні ручна висота, ні
      // вирівнювання рядка (align-self:flex-start знімає розтягування по
      // найвищому сусідові). Це рівно та висота, нижче за яку вміст почав
      // би обрізатись — рахувати її по "найнижчому видимому елементу"
      // виявилось неточно: у центрованому вмісті (кільце+легенда) нижній
      // край листа не враховує відступи знизу, і замір виходив на ~20px
      // меншим за реальну потребу — картку обрізало.
      const savedAlignSelf = nodes.map((node) => node.style.alignSelf);
      nodes.forEach((node) => {
        node.style.alignSelf = "flex-start";
      });
      // offsetHeight, а НЕ getBoundingClientRect().height: у режимі
      // редагування картки ледь повернуті (анімація погойдування), і
      // рамка поверненого прямокутника вища за сам блок — на широкій
      // картці це давало зайвих ~9px і всі розрахунки "пливли".
      const measureContentHeight = (node) => node.offsetHeight;
      // Прохід 1 — кільця в мінімумі: жорстка підлога.
      const natural = new Map(nodes.map((node) => [node.getAttribute("data-card-id"), measureContentHeight(node)]));
      // Прохід 2 — кільця в повний розмір: висота, на якій ручна висота
      // вже не потрібна.
      rings.forEach((ring) => {
        ring.style.setProperty("--mgr-ring-max", `${RING_MAX_PX}px`);
      });
      const full = new Map(nodes.map((node) => [node.getAttribute("data-card-id"), measureContentHeight(node)]));
      const slack = new Set();
      for (const node of nodes) {
        const id = node.getAttribute("data-card-id");
        const naturalH = natural.get(id) ?? 0;
        // Ручку показуємо там, де тягнути реально є куди: поточна висота
        // помітно більша за стиснуту (кільце в мінімумі, вміст упритул).
        // Порівняння саме з фактичною висотою, а не з "порожнечею під
        // вмістом": картка з кільцем виглядає щільною, але стиснутись
        // може — кільце вміє зменшуватись.
        if ((actualHeight.get(id) ?? naturalH) - naturalH > HEIGHT_STEP_PX) slack.add(id);
      }
      nodes.forEach((node, i) => {
        node.style.minHeight = savedMinHeight[i];
        node.style.height = savedHeight[i];
        node.style.alignSelf = savedAlignSelf[i];
      });
      rings.forEach((ring, i) => {
        if (savedRingCap[i]) ring.style.setProperty("--mgr-ring-max", savedRingCap[i]);
        else ring.style.removeProperty("--mgr-ring-max");
      });
      naturalHeightsRef.current = natural;
      fullHeightsRef.current = full;
      // Самолікування: збережена висота, що стала МЕНШОЮ за мінімально
      // можливу (вікно звузилось, підпис переніс рядок, картку звузили),
      // підтягується назад — інакше вміст вилазить за картку.
      const fixed = {};
      let needsFix = false;
      for (const [id, h] of Object.entries(cardHeights)) {
        const floor = natural.get(id);
        if (floor && h < floor) {
          fixed[id] = floor;
          needsFix = true;
        } else {
          fixed[id] = h;
        }
      }
      if (needsFix) persistHeights(fixed);
      // Кільця вміють стискатись — саме тому їхні картки можна зробити
      // нижчими за "звичайний" розмір кільця (рішення користувача: "якщо
      // картка дозволяє зменшитись — зменшуємо"). Стелю рахуємо тут, бо
      // CSS її не бачить: .mgr-first-try-body — flex із переносом, і
      // висоту рядка там диктує вміст, а не контейнер.
      applyRingCaps();
      setSlackCardIds((prev) => {
        if (prev.size === slack.size && [...slack].every((id) => prev.has(id))) return prev;
        return slack;
      });
    })();
  }, [editMode, orderKey, spansKey, heightsKey, cardHeights, enabledCards, state.data, viewportTick]);

  // Стеля кільця залежить від висоти картки, тож перераховуємо її не лише
  // в режимі редагування, а й просто при завантаженні зі збереженими
  // висотами чи після зміни складу/порядку карток.
  useLayoutEffect(() => {
    applyRingCaps();
  }, [heightsKey, spansKey, orderKey, enabledCards, state.data]);


  // Клік повз картки виходить із режиму перетягування — як тап по вільному
  // місцю екрана на iPhone (запит користувача). Слухач на документі, а не
  // на секції: "вільне місце" — це і все, що нижче сітки, не лише проміжки
  // між картками. Кнопки режиму й шторку налаштувань виключаємо, інакше
  // натискання на "Готово"/шестерню закривало б режим двічі.
  useEffect(() => {
    if (!editMode) return undefined;
    function handleOutsidePointerDown(e) {
      if (e.target?.closest?.("[data-card-id], .mgr-dashboard-done-btn, .mgr-dashboard-settings-btn, .mgr-drawer")) {
        return;
      }
      setEditMode(false);
    }
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [editMode]);

  // Булеве значення, а НЕ сам Set у залежностях: enabledCards — новий
  // об'єкт на кожен рендер (roleDefaultCards), тож ефект перезапускався
  // щоразу й cleanup скасовував власний, ще не завершений запит.
  const wantsHardestQuestions = enabledCards.has("hardestQuestions");
  useEffect(() => {
    // Ref, а не hardestQuestions.loading/items у залежностях: ефект САМ
    // виставляв loading:true, від чого залежності мінялись, ефект
    // перезапускався, cleanup скасовував перший запит — а повторний захід
    // одразу виходив по `loading === true`. Картка так і лишалась на
    // скелетоні назавжди (скарга користувача: "не грузится вообще").
    if (!wantsHardestQuestions || hardestQuestionsRequestedRef.current) return;
    hardestQuestionsRequestedRef.current = true;
    let cancelled = false;
    let settled = false;
    (async () => {
      setHardestQuestions({ loading: true, items: null, error: false });
      try {
        const res = await fetch("/api/manager/hardest-questions");
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        settled = true;
        if (!cancelled) setHardestQuestions({ loading: false, items: data.hardestQuestions, error: false });
      } catch {
        settled = true;
        if (!cancelled) {
          // Дозволяємо ще одну спробу (напр. після вимкнення/увімкнення
          // картки) — інакше збій мережі назавжди лишив би "Не вдалося".
          hardestQuestionsRequestedRef.current = false;
          setHardestQuestions({ loading: false, items: null, error: true });
        }
      }
    })();
    return () => {
      cancelled = true;
      // У dev React монтує ефекти двічі (StrictMode): перший запит
      // скасовується цим же cleanup, а повторний захід виходив би по
      // ref-прапорцю — і картка назавжди лишалась на скелетоні. Якщо
      // запит не встиг завершитись, знімаємо прапорець, щоб другий
      // монтаж зробив його заново.
      if (!settled) hardestQuestionsRequestedRef.current = false;
    };
  }, [wantsHardestQuestions]);

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

  // FLIP: після зміни порядку картки просто "телепортувались" би на нові
  // місця. Тут кожна, крім тієї, що в руці, стартує з попередньої позиції
  // і доїжджає в нову — той самий ефект, що в iOS, коли іконки
  // розступаються. Вимірювання — у useLayoutEffect (до промальовки), інакше
  // встиг би блимнути кадр зі стрибком.
  useLayoutEffect(() => {
    const prev = cardRectsRef.current;
    const next = new Map();
    // Не анімуємо, коли сторінку не видно: у прихованій вкладці браузер не
    // просуває анімації, і картка застигає на ПЕРШОМУ кадрі FLIP —
    // тобто зі зсувом, який мала до перестановки (видно як "картка поїхала
    // за край"). Позиції все одно перезаписуємо — щоб після повернення на
    // вкладку наступний FLIP рахувався від актуальних координат.
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.visibilityState !== "visible";
    for (const node of document.querySelectorAll("[data-card-id]")) {
      const id = node.getAttribute("data-card-id");
      // offsetLeft/Top, а НЕ getBoundingClientRect: у картки в руці на
      // transform висить зсув за курсором, і rect повертав би позицію
      // разом із ним — FLIP рахував би різницю "layout + курсор" і смикав
      // картки. offsetParent у всіх карток спільний, тож для різниці
      // позицій цього достатньо.
      const pos = { left: node.offsetLeft, top: node.offsetTop };
      next.set(id, pos);
      const old = prev.get(id);
      if (id === dragId) {
        // Картка в руці: після зміни порядку її МІСЦЕ в потоці інше, а
        // зсув ми рахуємо від точки захоплення. Без переприв'язки картка
        // стрибала на різницю layout-позицій після кожного обміну (і що
        // більше обмінів, то далі від курсора вона тікала).
        if (old && dragRef.current && (pos.left !== old.left || pos.top !== old.top)) {
          const shiftX = pos.left - old.left;
          const shiftY = pos.top - old.top;
          dragRef.current.startX += shiftX;
          dragRef.current.startY += shiftY;
          // І той самий зсув — із поточної дельти, інакше до наступного
          // pointermove встигне промалюватись кадр зі стрибком.
          setDragDelta((d) => ({ x: d.x - shiftX, y: d.y - shiftY }));
        }
        continue;
      }
      if (reduced || !old) continue;
      const dx = old.left - pos.left;
      const dy = old.top - pos.top;
      if (!dx && !dy) continue;
      // Гасимо попередній переїзд цієї ж картки, якщо він ще триває:
      // інакше два FLIP накладаються й картка "смикається" вдвічі.
      node.getAnimations?.().forEach((a) => a.cancel());
      node.animate?.(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
      );
    }
    cardRectsRef.current = next;
  }, [orderKey, dragId]);

  const flatTeam = useMemo(() => (state.data ? flattenTree(state.data.team.tree) : []), [state.data]);

  // "Статус по людях" (нова картка, блок СВ) — кожен НЕ-керівник у видимій
  // команді (в СВ таких зазвичай усі прямі підлеглі; в АСМ — усі польові
  // люди під його СВ), з чотирма лічильниками статусу. Найзанепокоєніші
  // (прострочено/не розпочато) — першими, і показуємо не більш ніж
  // PEOPLE_STATUS_LIMIT рядків, щоб велика команда не розтягувала картку
  // на весь екран (той самий компроміс, що вже є в hardestModules/
  // courseBreakdown — top-N, не все підряд).
  const peopleStatus = useMemo(() => {
    if (!state.data) return { rows: [], hiddenCount: 0 };
    const summaryMap = state.data.team.summaryByEmployeeId;
    const rows = flatTeam
      .filter((n) => !n.children || n.children.length === 0)
      .map((n) => ({ node: n, summary: summaryMap[n.id] }))
      .filter((r) => r.summary && r.summary.total > 0)
      .sort((a, b) => b.summary.overdue + b.summary.notStarted - (a.summary.overdue + a.summary.notStarted));
    const PEOPLE_STATUS_LIMIT = 15;
    return { rows: rows.slice(0, PEOPLE_STATUS_LIMIT), hiddenCount: Math.max(0, rows.length - PEOPLE_STATUS_LIMIT) };
  }, [state.data, flatTeam]);

  // "Порівняння команд" (нова картка, блок АСМ) — кожен ПРЯМИЙ підлеглий
  // керівника (для АСМ — його СВ, для СВ — просто кожна людина окремо,
  // деградує до "команди з однієї людини", теж має сенс), з підсумком по
  // ВСЬОМУ його піддереву (він сам + всі його підлеглі), не лише власними
  // enrollments.
  const teamCompare = useMemo(() => {
    if (!state.data) return [];
    const summaryMap = state.data.team.summaryByEmployeeId;
    return state.data.team.tree
      .map((node) => {
        const subtree = [node, ...flattenTree(node.children || [])];
        let total = 0;
        let completed = 0;
        let overdue = 0;
        for (const n of subtree) {
          const s = summaryMap[n.id];
          if (!s) continue;
          total += s.total;
          completed += s.completed;
          overdue += s.overdue;
        }
        return { id: node.id, name: node.name, total, completed, overdue, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
      })
      .filter((t) => t.total > 0)
      .sort((a, b) => b.pct - a.pct);
  }, [state.data]);

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
        <div className="mgr-page-header-actions">
          {/* Прямий лінк на /api/manager/export — браузер сам ініціює
              завантаження по Content-Disposition:attachment, без fetch+blob. */}
          <a className="admin-btn-link mgr-export-link" href="/api/manager/export" title="Завантажити звіт у форматі Excel">
            <ExcelIcon /> Завантажити звіт
          </a>
          {/* Навмисно ІНША іконка, ніж загальні налаштування застосунку
              (components/icons.jsx DashboardTuneIcon) — щоб "які графіки
              показувати" не плутався з рештою налаштувань профілю. */}
          {/* Режим перетягування карток. Довге натискання на саму картку
              вмикає його теж — кнопка тут для того, щоб функція була
              видимою, а не лише вгадуваною (і щоб було чим вийти). */}
          {editMode ? (
            <button type="button" className="mgr-dashboard-done-btn" onClick={() => setEditMode(false)}>
              Готово
            </button>
          ) : (
            <button
              type="button"
              className="mgr-dashboard-settings-btn"
              onClick={() => setEditMode(true)}
              aria-label="Переставити картки"
              title="Переставити картки: перетягніть їх або утримуйте картку"
            >
              <ArrowsMoveIcon />
            </button>
          )}
          <button
            type="button"
            className="mgr-dashboard-settings-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Налаштувати картки дашборда"
            title="Налаштувати картки дашборда"
          >
            <DashboardTuneIcon />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <ManagerDashboardSettings
          enabled={enabledCards}
          onToggle={toggleCard}
          onClose={() => setSettingsOpen(false)}
          onResetLayout={resetLayout}
        />
      )}

      <ProfileCard dbName={me.name} hasEmail={me.hasEmail} externalCode={me.externalCode} levelLabel={me.levelLabel} avatarUrl={me.avatarUrl} />

      <div className="mgr-kpi-row">
        <div className="mgr-kpi-tile">
          <b>{stats.teamSize}</b>
          <MarqueeText className="mgr-kpi-tile-label">у команді</MarqueeText>
        </div>
        <div className="mgr-kpi-tile">
          <b>{stats.avgScore != null ? `${stats.avgScore}%` : "—"}</b>
          <MarqueeText className="mgr-kpi-tile-label">середній бал</MarqueeText>
        </div>
        {/* Середній % команди від найкращих у своїх посадах + місце серед
            команд керівників тієї ж посади (ASM серед ASM). */}
        <div className="mgr-kpi-tile" title="Середній рейтинг підлеглих: % від найкращого у своїй посаді">
          <b>{rating.avg}%</b>
          <MarqueeText className="mgr-kpi-tile-label">
            рейтинг команди{rating.rank ? ` · №${rating.rank} з ${rating.teams}` : ""}
          </MarqueeText>
        </div>
        <div className={`mgr-kpi-tile${stats.overdueCount > 0 ? " mgr-kpi-tile-alert" : ""}`}>
          <b>{stats.overdueCount}</b>
          <MarqueeText className="mgr-kpi-tile-label">прострочено</MarqueeText>
        </div>
        {/* Замінено з "56% виконання команди" — той самий % тепер живе в
            кільці "Виконано" нижче, дублювати число в квадратній плитці
            й у кільці поруч не мало сенсу. Тут — конкретна кількість
            людей (скільком написати), а не ще один відсоток. */}
        <div className={`mgr-kpi-tile${stats.noActivityCount > 0 ? " mgr-kpi-tile-alert" : ""}`}>
          <b>{stats.noActivityCount}</b>
          <MarqueeText className="mgr-kpi-tile-label">без активності</MarqueeText>
        </div>
      </div>

      <section
        className={`mgr-section mgr-charts${editMode ? " mgr-charts-edit" : ""}`}
        onPointerDown={handleCardPointerDown}
        onPointerMove={handleCardPointerMove}
        onPointerUp={handleCardPointerUp}
        onPointerCancel={handleCardPointerUp}
      >
        {renderChartCards([
          ["rings", enabledCards.has("rings") && (
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
          )],

          /* Тренд по тижнях — коротко: к-сть складених модулів за останні
            6 тижнів (реальні дати ModuleCompletion.completedAt, без
            окремої "знімкової" інфраструктури — див. lib/managerDashboard.js
            getWeeklyTrend). */
          ["trend", enabledCards.has("trend") && (
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
          )],

          /* Єдиний блок дашборда, що дивиться ВПЕРЕД — решта показників
            ретроспективні. Рахуються лише незавершені призначення
            (lib/managerDashboard.js bucketDeadlineHorizon): у завершеного
            дедлайн уже не має сенсу, вкладеність у нього міряє окремий
            показник "Вчасно". */
          ["deadlines", enabledCards.has("deadlines") && (
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
                  <MarqueeText className="mgr-bar-label">{b.label}</MarqueeText>
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
          )],

          /* Розкид за середнім балом: 86% — це може бути "вся команда рівно
            на 86" або "половина на 100, половина ледь за порогом", і це
            різні управлінські ситуації. */
          ["scoreDist", enabledCards.has("scoreDist") && (
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
                  <MarqueeText className="mgr-bar-label">{b.label}</MarqueeText>
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
          )],

          /* Наскільки матеріал зрозумілий з першого проходження. Низький
            відсоток при високому "Складено" означає, що команда бере курс
            не знанням, а повторами. */
          ["firstTry", enabledCards.has("firstTry") && (
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
          )],

          /* Саме по собі "довго/швидко" не добре й не погано — цінність у
            крайнощах: купка спроб "до 10 хв" на змістовному курсі означає,
            що його прогортали, а хвіст "понад 40 хв" — що матеріал важкий
            або незручно поданий. */
          ["duration", enabledCards.has("duration") && (
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
                    <MarqueeText className="mgr-bar-label">{b.label}</MarqueeText>
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
          )],

          /* Було "% виконання" (рахувало status===completed, тобто й
            провалені курси теж) — перейменовано разом зі зміною лічильника
            в lib/managerDashboard.js getDashboardStats(): тепер рахує лише
            РЕАЛЬНО складені (passed===true, кожен модуль ≥ Course.
            passThreshold), інакше курс без жодного складеного показував би
            оманливі 100% лише тому, що всі до нього "дійшли". */
          ["courseBreakdown", enabledCards.has("courseBreakdown") && (
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
          )],

          /* Деталізація попереднього блоку на рівень нижче: курс → модуль.
            Єдине місце на дашборді, що доводить погану цифру до конкретної
            ТЕМИ, а не до людини чи курсу цілком. Подвійної ширини з тієї ж
            причини, що й "% складання по курсу" — назви модулів довгі. */
          ["hardestModules", enabledCards.has("hardestModules") && (
        <div className="mgr-chart-card mgr-chart-card-wide">
          <h2>
            <CourseIcon /> Найскладніші модулі
            <ChartHint text="Модулі, які команда найчастіше провалює — за кількістю людей, що не набрали прохідний бал модуля. Сортування за кількістю провалів, а не за відсотком: «1 з 1» дало б 100% і витіснило б реально проблемний «3 з 8». Модулі без жодного провалу в список не потрапляють. «У середньому спроб» — скільки разів людині доводилось проходити модуль: 1.0 означає «склали з першого разу», більше — матеріал давався важко навіть тим, хто зрештою склав." />
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
                    {m.avgAttempts > 1 ? (
                      <span className="mgr-bar-label-sub">У середньому спроб: {m.avgAttempts}</span>
                    ) : null}
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
          )],

          /* Нова картка (блок СВ, 2026-09-19) — компактний статус по кожній
            людині без керівних підлеглих, а не агрегат: СВ щодня цікавить
            саме "хто ще не почав/прострочив", а не середнє по команді. */
          ["peopleStatus", enabledCards.has("peopleStatus") && (
        <div className="mgr-chart-card mgr-chart-card-wide">
          <h2>
            <PeopleIcon /> Статус по людях
            <ChartHint text="Кожна людина без власних підлеглих у видимій команді — скільки в неї призначень якого статусу. Спочатку ті, в кого найбільше прострочень і ще не розпочатого — кому написати першим." />
          </h2>
          {peopleStatus.rows.length === 0 ? (
            <p className="admin-hint">Немає даних по людях.</p>
          ) : (
            <>
              <ul className="mgr-people-status-list">
                {peopleStatus.rows.map(({ node, summary }) => (
                  <li key={node.id} className="mgr-people-status-row">
                    <MarqueeText className="mgr-people-status-name">{node.name}</MarqueeText>
                    <span className="mgr-people-status-badges">
                      {summary.overdue > 0 && <span className="mgr-badge mgr-badge-overdue">{summary.overdue} прострочено</span>}
                      {summary.notStarted > 0 && <span className="mgr-badge">{summary.notStarted} не почав</span>}
                      {summary.inProgress > 0 && <span className="mgr-badge">{summary.inProgress} у процесі</span>}
                      {summary.completed > 0 && (
                        <span className={`mgr-badge${summary.failed > 0 ? " mgr-badge-fail" : " mgr-badge-success"}`}>
                          {summary.completed} завершено
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {peopleStatus.hiddenCount > 0 && (
                <p className="admin-hint mgr-people-status-more">і ще {peopleStatus.hiddenCount} — деталі нижче, в «Детально по команді»</p>
              )}
            </>
          )}
        </div>
          )],

          /* Нова картка (блок АСМ, 2026-09-19) — той самий підсумок, що
            "Показники команди" вище, але по КОЖНОМУ прямому підлеглому
            окремо (для АСМ — кожен СВ зі своєю командою), а не одним
            числом на всіх: порівняння команд одна з одною, не людей. */
          ["teamCompare", enabledCards.has("teamCompare") && (
        <div className="mgr-chart-card mgr-chart-card-wide">
          <h2>
            <PeopleIcon /> Порівняння команд
            <ChartHint text="Для кожного прямого підлеглого — підсумок по ньому й усіх, хто під ним (не лише його власні призначення). Дозволяє побачити, чия команда відстає, а не лише загальний середній по всіх одразу." />
          </h2>
          {teamCompare.length === 0 ? (
            <p className="admin-hint">Немає даних.</p>
          ) : (
            <ul className="mgr-bar-list">
              {teamCompare.map((t) => (
                <li key={t.id} className="mgr-bar-row">
                  <span className="mgr-bar-label mgr-bar-label-stack">
                    <span className="mgr-bar-label-main">{t.name}</span>
                    {t.overdue > 0 ? <span className="mgr-bar-label-sub">{t.overdue} прострочено</span> : null}
                  </span>
                  <div className="mgr-bar-track">
                    <div className="mgr-bar-fill" style={{ width: `${barsAnimated ? t.pct : 0}%` }} />
                  </div>
                  <span className="mgr-bar-value">
                    {t.completed}/{t.total} · {t.pct}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
          )],

          /* Нова картка (блок T&D, 2026-09-19) — окремий запит
            (/api/manager/hardest-questions, не /api/manager/overview):
            вимкнена за замовчуванням, тож зайвий запит по QuestionAnswer
            не виконується, поки керівник сам не увімкнув картку в
            налаштуваннях. */
          ["hardestQuestions", enabledCards.has("hardestQuestions") && (
        <div className="mgr-chart-card mgr-chart-card-wide">
          <h2>
            <CourseIcon /> Найскладніші питання
            <ChartHint text="Питання (не цілі модулі), на яких команда найчастіше помиляється, по всіх курсах разом. Точніше за «Найскладніші модулі» — показує конкретне питання, яке варто переформулювати чи пояснити в матеріалі. Питання з менш ніж 3 відповідями в список не потрапляють." />
          </h2>
          {hardestQuestions.loading ? (
            <LinesSkeleton rows={4} />
          ) : hardestQuestions.error ? (
            <p className="admin-hint">Не вдалося завантажити.</p>
          ) : !hardestQuestions.items || hardestQuestions.items.length === 0 ? (
            // Порожньо — це майже завжди не збій, а брак відповідей:
            // QuestionAnswer пишеться лише коли людина реально складає
            // модуль у плеєрі, і питання потрапляє в список від 3 відповідей.
            // Текст пояснює саме це, інакше порожня картка читається як
            // зламана (скарга користувача, 2026-09-19).
            <p className="admin-hint">
              Поки нема статистики: питання потрапляє сюди, коли команда дала на нього щонайменше 3 відповіді в
              модулях. Показник наповнюється в міру проходження курсів.
            </p>
          ) : (
            <ul className="mgr-bar-list">
              {hardestQuestions.items.map((q) => (
                <li key={q.id} className="mgr-bar-row">
                  <span className="mgr-bar-label mgr-bar-label-stack">
                    <span className="mgr-bar-label-main">{q.title}</span>
                    <span className="mgr-bar-label-sub">
                      {q.module} · {q.course}
                    </span>
                  </span>
                  <div className="mgr-bar-track">
                    <div className="mgr-bar-fill mgr-bar-fill-alert" style={{ width: `${barsAnimated ? q.pct : 0}%` }} />
                  </div>
                  <span className="mgr-bar-value">
                    {q.correct}/{q.total} · {q.pct}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
          )],
        ])}
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
