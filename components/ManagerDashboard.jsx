"use client";

import { cloneElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import { ProfileCard } from "@/components/ProfileCard";
import { MarqueeText } from "@/components/MarqueeText";
import { ManagerDashboardSettings } from "@/components/ManagerDashboardSettings";
import { EnrollmentRow, formatDuration } from "@/components/EnrollmentRow";
import { TeamStatusBar } from "@/components/TeamStatusBar";
import { AttentionList } from "@/components/AttentionList";
import { TeamMatrix } from "@/components/TeamMatrix";

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
// peopleStatus прибрано з дефолтів (2026-09-20, аудит "вообще без
// скелетонов мгновенно") — ця картка спирається на дерево команди
// (getTeamTree), найважчий за рендер-ціною запит сторінки; лишаючись
// дефолтною, вона змушувала його рахуватись одразу для більшості
// керівників (SV/ASM), зводячи нанівець відкладене підвантаження
// дерева нижче (ensureTeamTree). Керівник, кому вона реально потрібна,
// вмикає її сам — тоді дерево підвантажується одразу для НЬОГО, а не
// для всіх за замовчуванням.
const ROLE_DEFAULT_CARDS = {
  // peopleStatus (матриця люди × курси) повернуто в дефолт СВ/АСМ
  // (2026-09-23): дерева команди вона більше не потребує.
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

// Сітка дашборда в ЮНІТАХ (2026-09-23, рішення користувача: як Grafana —
// колонки по ширині контейнера, рядки фіксованої висоти, картка займає
// W×H цілих юнітів, `grid-auto-flow: dense` заповнює дірки). Розміри
// зберігаються в юнітах, тож один лейаут коректно перераховується на
// будь-якому екрані; старі ключі spans_v1/heights_v1 (пікселі) ігноруються.
// GRID_UNIT_PX/GRID_GAP_PX/GRID_ROW_PX ДЗЕРКАЛЯТЬ .mgr-charts у manager.css
// (--mgr-grid-unit/--mgr-grid-gap/--mgr-row-h): JS рахує кількість
// колонок і крок ручок, CSS малює — числа мають збігатись.
const DASHBOARD_LAYOUT_STORAGE_KEY = "carls_manager_dashboard_layout_v2";
const GRID_UNIT_PX = 240;
const GRID_GAP_PX = 16;
const GRID_ROW_PX = 112;
const MAX_CARD_H = 8;
// Дефолт W×H на картку — замість колишнього класу mgr-chart-card-wide.
const DEFAULT_CARD_SIZE = {
  rings: [2, 2],
  trend: [2, 2],
  deadlines: [1, 2],
  scoreDist: [1, 2],
  firstTry: [2, 2],
  duration: [2, 2],
  courseBreakdown: [2, 3],
  hardestModules: [2, 3],
  peopleStatus: [3, 4],
  teamCompare: [2, 3],
  hardestQuestions: [2, 3],
};
// Кільце (CompletionRing): звичайний розмір і межа, нижче якої відсоток
// усередині вже не прочитати.
const RING_MAX_PX = 108;
const RING_MIN_PX = 54;
// Наскільки можна зрушити вказівник, щоб це все ще вважалось кліком, а не
// перетягуванням.
const CLICK_SLOP_PX = 6;

function readStoredLayout() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Скільки колонок сітки вміщається в ширину контейнера — та сама
 *  формула, що repeat(auto-fill, minmax(unit, 1fr)) у CSS. */
function gridColumnsFor(width) {
  return Math.max(1, Math.floor((width + GRID_GAP_PX) / (GRID_UNIT_PX + GRID_GAP_PX)));
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
          {/* Ім'я — посилання на сторінку людини (/manager/team/[id],
              2026-09-23); розкриття курсів на місці лишилось за шевроном. */}
          <Link href={`/manager/team/${node.id}`} className="mgr-team-name-btn">
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
          </Link>
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
export function ManagerDashboard({ initialData = null, initialError = false }) {
  // Дані вже прийшли з сервера (app/manager/page.js, lib/managerOverview.js)
  // — loading:false одразу, без окремого клієнтського fetch() і
  // скелетон-спалаху на кожному монтуванні (раніше тут стояв fetch(
  // "/api/manager/overview") в ефекті нижче; той JSON-роут не брав участі
  // в client Router Cache, тож екран лишався найважчим навіть після
  // кешування enrollments — аудит "быстродействия не почувствовал",
  // 2026-09-19).
  const [state, setState] = useState({ loading: false, data: initialData, error: initialError });
  // Синхронізація з новими пропсами ПІД ЧАС рендеру (офіційний React-
  // патерн "adjusting state when a prop changes"), не в ефекті: ефект із
  // setState всередині — це завжди зайвий цикл рендер→commit→ефект→ще
  // один рендер, і react-hooks/set-state-in-effect справедливо на це
  // лається. Порівняння з попереднім прочитаним пропом — щоб оновлювати
  // state лише коли сервер РЕАЛЬНО прислав нові дані (після
  // router.refresh() у pull-to-refresh), а не на кожному рендері.
  const [prevInitialData, setPrevInitialData] = useState(initialData);
  const [prevInitialError, setPrevInitialError] = useState(initialError);
  if (initialData !== prevInitialData || initialError !== prevInitialError) {
    setPrevInitialData(initialData);
    setPrevInitialError(initialError);
    setState({ loading: false, data: initialData, error: initialError });
  }
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
  // null (не лінивий useState(readStoredCards)) — цей компонент рендериться
  // і на сервері (SSR), де localStorage нема: лінивий ініціалізатор читав
  // би його значення лише в браузері, і перший клієнтський рендер (ще до
  // ефекту нижче) відрізнявся б від SSR-розмітки — Hydration failed
  // (спіймано живим тестом, 2026-09-20, на збереженій ручній висоті
  // картки). Той самий прийом, що вже в ProfileCard.jsx для displayName:
  // читати ЛИШЕ в ефекті після монтування, коротка мить дефолту замість
  // збою гідратації.
  const [cardOverride, setCardOverride] = useState(null);
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
  // "Детально по команді" — унизу сторінки, найважчий за DOM блок (по
  // вузлу на кожного підлеглого). Дерево команди (getTeamTree) БІЛЬШЕ НЕ
  // приходить разом з рештою /api/manager/overview (аудит "вообще без
  // скелетонов мгновенно", 2026-09-20) — підвантажується окремим
  // /api/manager/team-tree лише коли ця секція реально потрібна
  // (ensureTeamTree нижче: IntersectionObserver, або одразу для
  // peopleStatus/teamCompare, якщо керівник їх увімкнув).
  const [teamTreeVisible, setTeamTreeVisible] = useState(false);
  const teamTreeSectionRef = useRef(null);
  const [teamTree, setTeamTree] = useState({ loading: false, data: null, error: false });
  // "Запит уже пішов" — ref, не стан, той самий прийом, що вже є для
  // hardestQuestions нижче: стан у залежностях перезапускав би ефект сам
  // на себе.
  const teamTreeRequestedRef = useRef(false);
  function ensureTeamTree() {
    if (teamTreeRequestedRef.current) return;
    teamTreeRequestedRef.current = true;
    setTeamTree({ loading: true, data: null, error: false });
    fetch("/api/manager/team-tree")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => setTeamTree({ loading: false, data: data.tree, error: false }))
      .catch(() => setTeamTree({ loading: false, data: null, error: true }));
  }
  // Перетягування карток (як іконки на iPhone): режим редагування, id
  // картки в руці та її зсув відносно точки захоплення.
  // Та сама причина, що й у cardOverride вище — null/{}, не лінивий
  // ініціалізатор з localStorage, інакше SSR-розмітка (без збереженого
  // порядку/ширини/висоти) розходиться з першим клієнтським рендером.
  const [storedOrder, setStoredOrder] = useState(null);
  // Розміри в юнітах сітки, які керівник сам поставив ручками (id ->
  // {w, h}). Поки картки тут нема — діє DEFAULT_CARD_SIZE.
  const [cardLayout, setCardLayout] = useState({});
  // Одним ефектом підхоплюємо всі збережені в localStorage налаштування
  // одразу після монтування на клієнті — до цього моменту дашборд секунду
  // показує SSR-дефолт (ролевий набір карток, розмітковий порядок/розмір),
  // потім перемикається на збережений вибір керівника. setState викликаємо
  // лише для того, що РЕАЛЬНО є в localStorage — щоб не переписувати
  // дефолт порожнім значенням там, де керівник іще нічого не налаштовував.
  useEffect(() => {
    const storedCards = readStoredCards();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- одноразове читання localStorage після монтування, не синхронізація зі стейтом React
    if (storedCards) setCardOverride(storedCards);
    const order = readStoredOrder();
    if (order) setStoredOrder(order);
    const layout = readStoredLayout();
    if (Object.keys(layout).length > 0) setCardLayout(layout);
  }, []);
  const [resizeId, setResizeId] = useState(null);
  const resizeRef = useRef(null);
  // Скільки колонок сітки вміщається зараз і яка реальна ширина однієї —
  // міряємо ResizeObserver-ом на самій секції (нижче): ширина картки в
  // юнітах клампиться по колонках, ручка по X крокує по реальній ширині
  // колонки, а не по номінальних 240px.
  const chartsRef = useRef(null);
  const [grid, setGrid] = useState({ cols: 4, colWidth: GRID_UNIT_PX });
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

  function persistLayout(next) {
    setCardLayout(next);
    try {
      window.localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Як і з рештою налаштувань дашборда — без localStorage просто не
      // переживе перезавантаження.
    }
  }

  /** Розмір картки в юнітах: збережений або дефолтний. */
  function cardSize(id) {
    const d = DEFAULT_CARD_SIZE[id] || [1, 2];
    const s = cardLayout[id];
    return { w: s?.w ?? d[0], h: s?.h ?? d[1] };
  }

  /**
   * Стеля розміру кільця (--mgr-ring-max): у сітці висота панелі задана
   * юнітами, тож кільце має вміститись у неї, а не навпаки. Зменшуємо,
   * доки тіло картки реально не перестане переповнюватись (краще трохи
   * менше кільце, ніж скрол усередині картки з кільцями). RING_MIN_PX —
   * нижче цифра всередині вже не читається.
   */
  function applyRingCaps() {
    for (const card of document.querySelectorAll("[data-card-id]")) {
      const rings = [...card.querySelectorAll(".mgr-ring")];
      if (rings.length === 0) continue;
      const setCap = (px) => rings.forEach((ring) => ring.style.setProperty("--mgr-ring-max", `${px}px`));
      const body = card.querySelector(".mgr-ring-grid, .mgr-first-try-body") || card;
      let cap = RING_MAX_PX;
      setCap(cap);
      for (let i = 0; i < 12 && cap > RING_MIN_PX && body.scrollHeight > body.clientHeight + 1; i++) {
        cap = Math.max(RING_MIN_PX, cap - 6);
        setCap(cap);
      }
    }
  }

  function resetLayout() {
    setStoredOrder(null);
    setCardLayout({});
    try {
      window.localStorage.removeItem(DASHBOARD_ORDER_STORAGE_KEY);
      window.localStorage.removeItem(DASHBOARD_LAYOUT_STORAGE_KEY);
      // Старі піксельні ключі (до сітки в юнітах) — прибираємо заодно.
      window.localStorage.removeItem("carls_manager_dashboard_spans_v1");
      window.localStorage.removeItem("carls_manager_dashboard_heights_v1");
    } catch {
      // Немає localStorage — стан у пам'яті все одно скинуто.
    }
  }

  // Дві ручки: на правому краю — ширина (кроком у колонку), на нижньому —
  // висота (кроком у рядок сітки). Одна вісь на ручку, а не кутовий
  // "хапок" одразу по двох: на дашборді майже завжди треба щось одне, і
  // по одній осі промахнутись важче (той самий підхід, що в Grafana/
  // Datadog для окремих країв плитки).
  function handleResizePointerDown(e, id, axis) {
    e.stopPropagation(); // інакше секція почне перетягувати саму картку
    resizeRef.current = { id, axis, startX: e.clientX, startY: e.clientY, start: cardSize(id) };
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
    const current = cardSize(resize.id);
    let next;
    if (resize.axis === "y") {
      const steps = Math.round((e.clientY - resize.startY) / (GRID_ROW_PX + GRID_GAP_PX));
      next = { ...current, h: Math.min(MAX_CARD_H, Math.max(1, resize.start.h + steps)) };
    } else {
      const steps = Math.round((e.clientX - resize.startX) / (grid.colWidth + GRID_GAP_PX));
      next = { ...current, w: Math.min(grid.cols, Math.max(1, resize.start.w + steps)) };
    }
    if (next.w === current.w && next.h === current.h) return;
    persistLayout({ ...cardLayout, [resize.id]: next });
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
      // W клампиться по реально доступних колонках (телефон — 1, вузьке
      // вікно — 2…), збережене значення при цьому не втрачається.
      const { w, h } = cardSize(id);
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
              onPointerDown={(e) => handleResizePointerDown(e, id, "x")}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={handleResizePointerUp}
            />,
            <span
              key="mgr-card-resize-y"
              className="mgr-card-resize mgr-card-resize-y"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Змінити висоту картки"
              title="Потягніть, щоб змінити висоту картки (кроком у рядок сітки)"
              onPointerDown={(e) => handleResizePointerDown(e, id, "y")}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={handleResizePointerUp}
            />,
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
            // Юніти сітки; на телефоні CSS перекриває їх !important-ом
            // (одна колонка, висота по вмісту).
            gridColumn: `span ${Math.min(w, grid.cols)}`,
            gridRow: `span ${h}`,
            ...(isDragging ? { transform: `translate(${dragDelta.x}px, ${dragDelta.y}px)` } : null),
          },
        },
        node.props.children,
        removeButton,
        resizeHandles
      );
    });
  }

  const layoutKey = JSON.stringify(cardLayout);
  // Кількість колонок і реальна ширина однієї — з ширини секції. Той
  // самий поріг, що repeat(auto-fill, minmax(unit,1fr)) у CSS, тож JS і
  // CSS завжди згодні, скільки колонок є. useLayoutEffect: клампінг W по
  // колонках має спрацювати до першого пейнту, інакше на вузькому вікні
  // на кадр з'являється картка ширша за сітку.
  useLayoutEffect(() => {
    const el = chartsRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const update = () => {
      const width = el.clientWidth;
      if (!width) return;
      const cols = gridColumnsFor(width);
      const colWidth = (width - (cols - 1) * GRID_GAP_PX) / cols;
      setGrid((prev) => (prev.cols === cols && Math.abs(prev.colWidth - colWidth) < 1 ? prev : { cols, colWidth }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [state.data]);

  // Стеля кільця залежить від висоти панелі (юніти) і її ширини, тож
  // перераховуємо при кожній зміні лейауту/сітки/набору карток. useEffect
  // (не useLayoutEffect): прохід offsetHeight по картках не повинен
  // блокувати перший пейнт (аудит "скелетони між екранами", 2026-09-19).
  useEffect(() => {
    applyRingCaps();
  }, [layoutKey, orderKey, enabledCards, state.data, grid]);


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

  // ВИДИМІСТЬ секції, щоб не монтувати важкий список заздалегідь — і
  // тригер ленивого fetch дерева (ensureTeamTree, ідемпотентний — сам
  // стежить, щоб не піти в мережу двічі). state.data у залежностях
  // ОБОВ'ЯЗКОВИЙ, не лише teamTreeVisible: поки state.loading===true,
  // компонент повертає скелетон РАНІШЕ цього <section ref=...> — ref ще
  // null, ефект виходить без спостерігача. Без state.data у залежностях
  // повторний рендер (коли дані нарешті прийшли й ref з'явився) нічого
  // не змінює у [teamTreeVisible] (той самий false і до, і після) —
  // ефект просто НЕ перезапускається, і список навіки лишається на
  // скелетоні (знайдено живим тестом скролу, не лише збіркою, 2026-09-19).
  useEffect(() => {
    const el = teamTreeSectionRef.current;
    if (!el || teamTreeVisible) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setTeamTreeVisible(true);
          ensureTeamTree();
        }
      },
      // 150px запасу знизу — монтується, поки керівник ще скролить до
      // секції, а не в момент, коли вона вже впирається в нижній край
      // екрана (інакше короткий "скелетон-спалах" видно щоразу). Було
      // 600px — на мобільному (картки в стовпчик, не в ряд, короткий
      // viewport) це фактично покривало всю сторінку одразу від
      // завантаження, і "відкладена" секція та peopleStatus/teamCompare
      // однаково тягли дерево команди миттєво (скарга користувача,
      // перевірка на телефоні, 2026-09-20) — весь сенс відкладеного
      // fetch зникав саме там, де він найпотрібніший (повільна мережа).
      { rootMargin: "150px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [teamTreeVisible, state.data]);

  // teamCompare (спирається на дерево команди) стоїть ВИЩЕ секції
  // "Детально по команді" — раніше при увімкненій картці дерево тягнулось
  // одразу на монтуванні, навіть коли сама картка ще не в екрані (скарга
  // користувача, 2026-09-20). Тепер у неї своя IntersectionObserver-
  // підв'язка до її ж DOM-вузла, той самий rootMargin, що в "Детально по
  // команді" — ensureTeamTree() ідемпотентний. Матриця люди × курси
  // (peopleStatus) дерева більше не потребує — дані приходять з overview.
  const teamCompareWanted = enabledCards.has("teamCompare");
  const teamCompareSectionRef = useRef(null);
  useEffect(() => {
    if (!teamCompareWanted) return undefined;
    const el = teamCompareSectionRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          ensureTeamTree();
          observer.disconnect();
        }
      },
      { rootMargin: "150px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [teamCompareWanted, state.data]);

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

  const flatTeam = useMemo(() => (teamTree.data ? flattenTree(teamTree.data) : []), [teamTree.data]);

  // "Порівняння команд" (нова картка, блок АСМ) — кожен ПРЯМИЙ підлеглий
  // керівника (для АСМ — його СВ, для СВ — просто кожна людина окремо,
  // деградує до "команди з однієї людини", теж має сенс), з підсумком по
  // ВСЬОМУ його піддереву (він сам + всі його підлеглі), не лише власними
  // enrollments.
  const teamCompare = useMemo(() => {
    if (!state.data || !teamTree.data) return [];
    const summaryMap = state.data.team.summaryByEmployeeId;
    return teamTree.data
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
  }, [state.data, teamTree.data]);

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
  const { stats, summaryByEmployeeId, weeklyTrend, rating, funnels } = team;
  const funnelByCourseId = new Map((funnels || []).map((f) => [f.id, f]));
  const trendMax = Math.max(1, ...weeklyTrend.map((w) => w.count));
  // team.tree більше не приходить разом з рештою (ensureTeamTree/teamTree
  // вище) — БЕЗ фільтра показуємо вкладене дерево (teamTree.data, той
  // самий формат, що раніше team.tree), З фільтром — пласкі filteredFlat
  // (уже без children, той самий принцип, що й був).
  const visibleNodes = sortNodes(filteredFlat ?? teamTree.data ?? [], sortBy, summaryByEmployeeId, rating.byEmployeeId);
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
        <h1 className="greeting hub-greeting-h1">КАБІНЕТ КЕРІВНИКА</h1>
        <div className="mgr-page-header-actions">
          {/* Прямий лінк на /api/manager/export — браузер сам ініціює
              завантаження по Content-Disposition:attachment, без fetch+blob. */}
          <a className="admin-btn-link mgr-export-link" href="/api/manager/export" title="Завантажити звіт у форматі Excel" aria-label="Завантажити звіт у форматі Excel">
            <ExcelIcon /> <span className="mgr-export-label">Завантажити звіт</span>
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
            className={`mgr-dashboard-settings-btn${settingsOpen ? " is-active" : ""}`}
            onClick={() => setSettingsOpen(true)}
            aria-label="Налаштувати картки дашборда"
            title="Налаштувати картки дашборда"
            aria-pressed={settingsOpen}
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

      {/* Клікабельна → "Досягнення" з підсвіткою картки рейтингу, той самий
          підхід, що й на /hub (2026-09-22, рішення користувача:
          "унифицировать подходы"). externalCode прибрано — ProfileCard.jsx
          більше не приймає й не показує цей пропс (той самий фікс, що вже
          був на /hub). */}
      <ProfileCard
        dbName={me.name}
        hasEmail={me.hasEmail}
        levelLabel={me.levelLabel}
        avatarUrl={me.avatarUrl}
        href="/manager/achievements?highlight=rating"
      />

      {/* Замість п'яти KPI-плиток (2026-09-23): полоса статусів команди —
          кожна людина рівно в одному сегменті, сегмент = посилання на
          список; і топ-5 «Потребують уваги» з кнопкою «Нагадати». Обидва
          блоки — поза сіткою карток, це шапка дашборда, не панелі. */}
      <div className="mgr-overview-head">
        <TeamStatusBar data={team.statusBar} />
        <AttentionList items={team.attention} />
      </div>

      <section
        ref={chartsRef}
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
          {/* Кожне кільце — посилання на список за тим самим критерієм:
              «Вчасно» веде до доповнення (хто НЕ вчасно), «Розпочали» —
              до тих, хто ще не почав: діяти треба саме по них. */}
          <div className="mgr-ring-grid">
            <CompletionRing pct={stats.completionRate} label="Виконано" color={rateColor(stats.completionRate, ringValues)} href="/manager/team?view=courses&status=completed" />
            <CompletionRing pct={stats.passRate} label="Складено (80%+)" color={rateColor(stats.passRate, ringValues)} href="/manager/team?view=courses&status=passed" />
            <CompletionRing pct={stats.onTimeRate} label="Вчасно" color={rateColor(stats.onTimeRate, ringValues)} href="/manager/team?view=courses&timing=late" />
            <CompletionRing pct={stats.engagementRate} label="Розпочали" color={rateColor(stats.engagementRate, ringValues)} href="/manager/team?status=not_started" />
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
                <Link
                  key={w.label}
                  href={`/manager/team?week=${w.weekIndex}`}
                  className="mgr-trend-col mgr-card-link"
                  // Розбивка по людях — у підказці бару; клік — список тих,
                  // хто складав модулі того тижня.
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
                </Link>
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
                <li key={b.key}>
                  <Link href={`/manager/team?view=courses&due=${b.key}`} className="mgr-bar-row mgr-card-link">
                    <MarqueeText className="mgr-bar-label">{b.label}</MarqueeText>
                    <div className="mgr-bar-track">
                      <div
                        className={`mgr-bar-fill${b.alert && b.count > 0 ? " mgr-bar-fill-alert" : ""}`}
                        style={{ width: `${barsAnimated ? (b.count / deadlineMax) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="mgr-bar-value">{b.count}</span>
                  </Link>
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
                <li key={b.key}>
                  <Link href={`/manager/team?view=courses&score=${b.key}`} className="mgr-bar-row mgr-card-link">
                    <MarqueeText className="mgr-bar-label">{b.label}</MarqueeText>
                    <div className="mgr-bar-track">
                      <div
                        className="mgr-bar-fill"
                        style={{ width: `${barsAnimated ? (b.count / scoreDistMax) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="mgr-bar-value">{b.count}</span>
                  </Link>
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
        <div className="mgr-chart-card mgr-first-try-card">
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
                  <Link href="/manager/team?view=courses&retried=1" className="mgr-card-link">
                    <b>{stats.firstAttempt.retried}</b>
                    <span>з другої та далі</span>
                  </Link>
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
        <div className="mgr-chart-card">
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
        <div className="mgr-chart-card">
          <h2>
            <TrendIcon /> % складання по курсу
            <ChartHint text="Скільки людей РЕАЛЬНО склали курс (набрали його прохідний бал) із тих, кому він призначений. Той, хто дійшов до кінця й не набрав порогу, у зелену частину не рахується." />
          </h2>
          {stats.courseBreakdown.length === 0 ? (
            <p className="admin-hint">Немає даних.</p>
          ) : (
            <ul className="mgr-bar-list">
              {stats.courseBreakdown.map((c) => {
                const f = funnelByCourseId.get(c.id);
                const stage = (key, value, label) => (
                  <Link key={key} href={`/manager/team?view=courses&course=${encodeURIComponent(c.slug)}&stage=${key}`} className="mgr-funnel-stage" title={label}>
                    {value}
                  </Link>
                );
                return (
                  <li key={c.id}>
                    {/* Перенос у 2 рядки, а не біжучий рядок: у вузькій
                        картці MarqueeText прокручував би КОЖНУ назву. */}
                    <div className="mgr-bar-row">
                      <Link href={`/manager/team?view=courses&course=${encodeURIComponent(c.slug)}`} className="mgr-bar-label mgr-bar-label-stack mgr-card-link">
                        <span className="mgr-bar-label-main">{c.title}</span>
                      </Link>
                      <div className="mgr-bar-track">
                        <div className="mgr-bar-fill" style={{ width: `${barsAnimated ? c.pct : 0}%` }} />
                      </div>
                      <span className="mgr-bar-value">
                        {c.completed}/{c.total} · {c.pct}%
                      </span>
                    </div>
                    {/* Воронка курсу: призначено → почали → склали → 100%;
                        кожна цифра — список саме тих призначень. */}
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
        </div>
          )],

          /* Деталізація попереднього блоку на рівень нижче: курс → модуль.
            Єдине місце на дашборді, що доводить погану цифру до конкретної
            ТЕМИ, а не до людини чи курсу цілком. Подвійної ширини з тієї ж
            причини, що й "% складання по курсу" — назви модулів довгі. */
          ["hardestModules", enabledCards.has("hardestModules") && (
        <div className="mgr-chart-card">
          <h2>
            <CourseIcon /> Найскладніші модулі
            <ChartHint text="Модулі, які команда найчастіше провалює — за кількістю людей, що не набрали прохідний бал модуля. Сортування за кількістю провалів, а не за відсотком: «1 з 1» дало б 100% і витіснило б реально проблемний «3 з 8». Модулі без жодного провалу в список не потрапляють. «У середньому спроб» — скільки разів людині доводилось проходити модуль: 1.0 означає «склали з першого разу», більше — матеріал давався важко навіть тим, хто зрештою склав." />
          </h2>
          {stats.hardestModules.length === 0 ? (
            <p className="admin-hint">Жоден модуль не провалено — складних місць поки немає.</p>
          ) : (
            <ul className="mgr-bar-list">
              {stats.hardestModules.map((m) => (
                <li key={m.id}>
                  {/* Клік — хто саме провалив цей модуль. Назва модуля +
                      курс ДВОМА рядками (у вузькій колонці одним не влазить). */}
                  <Link href={`/manager/team?view=courses&module=${m.id}`} className="mgr-bar-row mgr-card-link">
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
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
          )],

          /* Нова картка (блок СВ, 2026-09-19) — компактний статус по кожній
            людині без керівних підлеглих, а не агрегат: СВ щодня цікавить
            саме "хто ще не почав/прострочив", а не середнє по команді. */
          /* Матриця люди × курси (2026-09-23) — замість «Статусу по людях»:
            id картки лишився peopleStatus заради збереженого в localStorage
            вибору/порядку. Дерева команди не потребує — дані з overview. */
          ["peopleStatus", enabledCards.has("peopleStatus") && (
        <div className="mgr-chart-card">
          <h2>
            <PeopleIcon /> Люди × курси
            <ChartHint text="Уся команда одним поглядом: рядок — людина (проблемні зверху), стовпчик — курс, клітинка — стан призначення. Клік по клітинці відкриває цей курс у цієї людини, по імені — сторінку людини, по назві курсу — усі призначення курсу." />
          </h2>
          <TeamMatrix data={team.matrix} />
        </div>
          )],

          /* Нова картка (блок АСМ, 2026-09-19) — той самий підсумок, що
            "Показники команди" вище, але по КОЖНОМУ прямому підлеглому
            окремо (для АСМ — кожен СВ зі своєю командою), а не одним
            числом на всіх: порівняння команд одна з одною, не людей. */
          ["teamCompare", enabledCards.has("teamCompare") && (
        <div className="mgr-chart-card" ref={teamCompareSectionRef}>
          <h2>
            <PeopleIcon /> Порівняння команд
            <ChartHint text="Для кожного прямого підлеглого — підсумок по ньому й усіх, хто під ним (не лише його власні призначення). Дозволяє побачити, чия команда відстає, а не лише загальний середній по всіх одразу." />
          </h2>
          {!teamTree.data ? (
            <LinesSkeleton rows={5} />
          ) : teamCompare.length === 0 ? (
            <p className="admin-hint">Немає даних.</p>
          ) : (
            <ul className="mgr-bar-list">
              {teamCompare.map((t) => (
                <li key={t.id}>
                  {/* Клік — та сама сторінка команди, але в межах
                      піддерева цього прямого підлеглого (?team=). */}
                  <Link href={`/manager/team?team=${t.id}`} className="mgr-bar-row mgr-card-link">
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
                  </Link>
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
        <div className="mgr-chart-card">
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

      <section className="mgr-section" ref={teamTreeSectionRef}>
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

        {teamTree.error ? (
          <p className="admin-hint">Не вдалося завантажити список команди.</p>
        ) : !teamTree.data ? (
          // Дерево команди підвантажується ОКРЕМИМ запитом
          // (/api/manager/team-tree, ensureTeamTree вище) — найважчий за
          // кількістю DOM-вузлів блок сторінки (по вузлу-компоненту на
          // кожного підлеглого, з бейджами/MarqueeText/можливими дітьми),
          // а долистовує сюди не кожен керівник одразу (аудит "вообще без
          // скелетонов мгновенно", 2026-09-20). IntersectionObserver вище
          // запускає і видимість, і сам fetch, щойно секція наближається
          // до вʼюпорта.
          <LinesSkeleton rows={6} />
        ) : flatTeam.length === 0 ? (
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
