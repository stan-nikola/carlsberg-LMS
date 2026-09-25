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
  RingsIcon,
} from "@/components/icons";
import { HintDot } from "@/components/HintDot";
import { CompletionRing } from "@/components/CompletionRing";
import { GridStack } from "gridstack";
import { medalTier } from "@/lib/progress";
import { PageSkeleton, LinesSkeleton } from "@/components/Skeleton";
import { Avatar } from "@/components/Avatar";
import { ProfileCard } from "@/components/ProfileCard";
import { MarqueeText } from "@/components/MarqueeText";
import { ManagerDashboardSettings } from "@/components/ManagerDashboardSettings";
import { EnrollmentRow, formatDuration } from "@/components/EnrollmentRow";
import { TeamStatusBar } from "@/components/TeamStatusBar";
import { pluralPeople } from "@/lib/teamInsights";
import { AttentionList } from "@/components/AttentionList";
import { TeamMatrix } from "@/components/TeamMatrix";

// localStorage, не БД (рішення користувача, 2026-09-19) — вибір карток
// живе лише в цьому браузері, на іншому пристрої дашборд знову стартує з
// ролевого дефолту нижче. v1 — щоб можна було безпечно змінити формат, не
// читаючи старий несумісний масив як валідний.
// v2 (2026-09-23): у наборі з'явились "status"/"attention" — картки, яких
// у збереженому v1-списку бути не могло, тож старий вибір не підходить:
// людина з v1 просто не побачила б нових карток. Ключ змінено, дашборд
// стартує з ролевого дефолту нижче.
const DASHBOARD_CARDS_STORAGE_KEY = "carls_manager_dashboard_cards_v2";

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
  SV: ["status", "attention", "rings", "deadlines", "scoreDist", "peopleStatus"],
  ASM: ["status", "attention", "rings", "deadlines", "scoreDist", "peopleStatus"],
};
const FALLBACK_ROLE_DEFAULT_CARDS = [
  "status",
  "attention",
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

// Сітка дашборда — gridstack.js (2026-09-24, рішення користувача після
// двох власних движків: flex-wrap лишав дірки, власний grid у юнітах
// смикався при перетягуванні й розтягував картки в порожнечу).
// Модель як у Grafana: 12 віртуальних колонок, ширина картки — частка з
// них (тож згорнута бічна панель просто робить усе пропорційно ширшим,
// розкладка не міняється), висота — СТРОГО по вмісту (sizeToContent),
// картки «спливають» угору в порожнє місце (float:false), перетягування
// з плейсхолдером і автоскролом сторінки біля краю. Зберігається лише
// {x,y,w} по картках; старі ключі юнітів/пікселів ігноруються.
const DASHBOARD_GRID_STORAGE_KEY = "carls_manager_dashboard_grid_v3";
const GRID_COLUMNS = 12;
// Крок висоти. Дрібний — щоб картка «по вмісту» майже не мала повітря
// знизу (округлення вгору не більше за одну клітинку).
const GRID_CELL_HEIGHT_PX = 24;
// Половина проміжку між картками: gridstack ставить margin з кожного боку.
const GRID_MARGIN_PX = 8;
// Дефолтна ширина картки в колонках із 12; вужче за MIN_CARD_W картку не
// стиснути — у 2 колонках (~180px) не читається жодна діаграма.
const DEFAULT_CARD_W = {
  status: 6,
  attention: 6,
  rings: 6,
  trend: 6,
  deadlines: 3,
  scoreDist: 3,
  firstTry: 6,
  duration: 6,
  courseBreakdown: 6,
  hardestModules: 6,
  peopleStatus: 12,
  teamCompare: 6,
  hardestQuestions: 6,
};
const MIN_CARD_W = 3;

/** Збережена розкладка gridstack: масив {id,x,y,w}; будь-яке сміття → null. */
function readStoredGrid() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DASHBOARD_GRID_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((n) => n && typeof n.id === "string" && Number.isInteger(n.x) && Number.isInteger(n.y) && Number.isInteger(n.w));
  } catch {
    return null;
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
  "status",
  "attention",
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
  // Збережена розкладка gridstack (readStoredGrid) — підхоплюється тим же
  // ефектом, що й решта налаштувань, і застосовується при ініціалізації
  // сітки (grid.load) нижче. null — ще не читали; [] — нічого не збережено.
  const [storedGrid, setStoredGrid] = useState(null);
  // Скидання розкладки перемонтовує сітку (key на секції): простіше й
  // надійніше, ніж повертати кожній картці дефолт через API gridstack.
  const [gridEpoch, setGridEpoch] = useState(0);
  // Одним ефектом підхоплюємо всі збережені в localStorage налаштування
  // одразу після монтування на клієнті — до цього моменту дашборд показує
  // SSR-дефолт (ролевий набір карток, розмітковий порядок/розмір), потім
  // перемикається на збережений вибір керівника. setState викликаємо лише
  // для того, що РЕАЛЬНО є в localStorage — щоб не переписувати дефолт
  // порожнім значенням там, де керівник іще нічого не налаштовував.
  //
  // useLayoutEffect, а НЕ useEffect: читання й підстановка встигають до
  // першої промальовки, тож кадру з канонічною розкладкою на екрані вже
  // немає. Робота тут — лише читання localStorage і setState, важких
  // замірів DOM немає (на відміну від ефекту авто-висоти нижче, який
  // свідомо лишається звичайним useEffect).
  useLayoutEffect(() => {
    const storedCards = readStoredCards();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- одноразове читання localStorage після монтування, не синхронізація зі стейтом React
    if (storedCards) setCardOverride(storedCards);
    const order = readStoredOrder();
    if (order) setStoredOrder(order);
    setStoredGrid(readStoredGrid() || []);
  }, []);
  const chartsRef = useRef(null);
  // Екземпляр gridstack живе в ref, не в стані: React про його зміни
  // знати не мусить, вони не впливають на розмітку карток.
  const gridRef = useRef(null);
  const [editMode, setEditMode] = useState(false);
  const longPressRef = useRef(null);

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

  function resetLayout() {
    setStoredOrder(null);
    setStoredGrid([]);
    try {
      window.localStorage.removeItem(DASHBOARD_ORDER_STORAGE_KEY);
      window.localStorage.removeItem(DASHBOARD_GRID_STORAGE_KEY);
      // Ключі попередніх движків сітки — прибираємо заодно.
      window.localStorage.removeItem("carls_manager_dashboard_layout_v2");
      window.localStorage.removeItem("carls_manager_dashboard_spans_v1");
      window.localStorage.removeItem("carls_manager_dashboard_heights_v1");
    } catch {
      // Немає localStorage — стан у пам'яті все одно скинуто.
    }
    setGridEpoch((n) => n + 1);
  }

  function cancelLongPress() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
  }

  // Довге натискання на картку вмикає режим перетягування — як на іконку
  // в iOS. Саме перетягування далі веде gridstack (сітка стає
  // не-static в ефекті нижче); наступне натискання вже тягне картку.
  // Обробники — на секції (делегування), а не на кожній картці.
  function handleCardPointerDown(e) {
    if (editMode || !e.target?.closest?.("[data-card-id]")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Посилання й кнопки всередині картки — це клік, не «взяти картку».
    if (e.target.closest("a, button, input, select")) return;
    const { clientX, clientY } = e;
    const timer = setTimeout(() => {
      longPressRef.current = null;
      setEditMode(true);
    }, LONG_PRESS_MS);
    longPressRef.current = { timer, startX: clientX, startY: clientY };
  }

  function handleCardPointerMove(e) {
    // Рух далі допуску до спрацювання таймера — це скрол/виділення
    // тексту, а не намір тягнути.
    const pending = longPressRef.current;
    if (pending && Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      cancelLongPress();
    }
  }

  /**
   * Приймає пари [id, вузол] у канонічному порядку, повертає їх у порядку
   * керівника, загорнутими в структуру gridstack:
   *   .grid-stack-item[gs-id] > .grid-stack-item-content > .mgr-chart-card
   * Атрибути gs-* на обгортці — ЛИШЕ стартові й сталі (React їх більше
   * не переписує): далі ними володіє gridstack, і будь-яка зміна пропса з
   * боку React затерла б позицію, яку сітка щойно виставила.
   * cloneElement — щоб не переписувати розмітку всіх 13 карток.
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
      // Хрестик у режимі перетягування — той самий жест, що прибирає
      // іконку з екрана iPhone: знімає галочку видимості цієї картки
      // (той самий toggleCard, що й чекбокс у шторці налаштувань, тож
      // повернути її можна там же). Лежить на обгортці, а не в картці:
      // .grid-stack-item-content ріже все, що звисає за край.
      const removeButton = editMode ? (
        <button
          type="button"
          className="mgr-card-remove"
          aria-label="Прибрати картку з дашборда"
          title="Прибрати з дашборда (повернути — у налаштуваннях карток)"
          onClick={() => toggleCard(id)}
        >
          <XIcon />
        </button>
      ) : null;
      return (
        <div key={id} className="grid-stack-item" data-card-id={id} gs-id={id} gs-w={DEFAULT_CARD_W[id] || 6} gs-min-w={MIN_CARD_W}>
          <div className="grid-stack-item-content">
            {cloneElement(node, { className: `${node.props.className}${editMode ? " is-editable" : ""}` })}
          </div>
          {removeButton}
        </div>
      );
    });
  }

  // ---- gridstack: ініціалізація ----
  // Один раз на монтування секції (gridEpoch міняє key — тоді заново).
  // Існуючі DOM-діти секції стають віджетами (init читає gs-* атрибути),
  // збережені позиції накладаються через load() по gs-id. Картки, яких у
  // збереженому нема (нова картка, увімкнена пізніше), стають в кінець
  // (autoPosition) — гравітація підбирає їх угору сама.
  // useLayoutEffect: до першого пейнту, інакше кадр із картками, звалени-
  // ми в кут (до init усі .grid-stack-item лежать absolute у 0,0).
  const hasData = Boolean(state.data);
  useLayoutEffect(() => {
    const el = chartsRef.current;
    if (!el || !hasData || storedGrid === null || gridRef.current) return undefined;
    const grid = GridStack.init(
      {
        column: GRID_COLUMNS,
        cellHeight: GRID_CELL_HEIGHT_PX,
        margin: GRID_MARGIN_PX,
        float: false,
        // Стартуємо БЕЗ анімації: розстановка збереженої розкладки
        // (grid.load) і перший замір висот під вміст (sizeToContent) —
        // це не «керівник щось перетягнув», а відновлення стану, і
        // анімувати його означало показати, як картки «стрибають» у свої
        // місця на кожному перезавантаженні (скарга користувача,
        // 2026-09-24). Вмикаємо анімацію нижче, коли розкладка вже стала.
        animate: false,
        sizeToContent: true,
        staticGrid: true,
        // Телефон — один стовпчик, порядок зберігається (moveScale).
        columnOpts: { breakpoints: [{ w: 599, c: 1 }], breakpointForWindow: true, layout: "moveScale" },
        // Ширину тягнемо лише за правий край; висота — завжди по вмісту.
        resizable: { handles: "e" },
        // Хрестик і посилання всередині картки — не початок перетягування.
        draggable: { cancel: "input,textarea,button,select,option,a,.mgr-card-remove", scroll: true },
        // placeholderClass не чіпаємо: опція приймає ОДИН клас (classList.add
        // з пробілом кидає й зриває перетягування на першому ж русі —
        // спіймано живим тестом), а стиль плейсхолдера сидить у manager.css
        // на дефолтному .grid-stack-placeholder.
      },
      el
    );
    if (!grid) return undefined;
    gridRef.current = grid;
    // Є збережена розкладка — застосовуємо ТОЧНО її й БІЛЬШЕ НЕ чіпаємо.
    // compact() тут запускати не можна: він переупаковує картки в лівий
    // верх, руйнуючи розстановку керівника (будь-який навмисний проміжок
    // «схлопується»), а подія change одразу перезаписує localStorage цією
    // упакованою версією — тобто збережений вибір губиться на першому ж
    // перезавантаженні (баг на проді, 2026-09-25: «до F5 стоять правильно,
    // після — з'їжджають»). compact доречний ЛИШЕ для новоствореної
    // розкладки без збереження — щоб заповнити дірки під короткими
    // картками після першого заміру висот.
    const fresh = storedGrid.length === 0;
    if (!fresh) grid.load(storedGrid, false);
    // Показуємо картки лише КОЛИ розкладка вже стала: init + load + перший
    // замір висот під вміст відбулись, але без анімації й під
    // visibility:hidden (.mgr-charts до .is-ready). Два кадри — щоб
    // sizeToContent (він міряє в наступному кадрі) встиг; після цього
    // вмикаємо анімацію, тож подальші перетягування/ресайз плавні, а
    // перше відкриття — ні.
    let revealRaf = requestAnimationFrame(() => {
      revealRaf = requestAnimationFrame(() => {
        if (!grid.el) return;
        if (fresh) grid.compact();
        grid.setAnimation(true);
        el.classList.add("is-ready");
      });
    });
    // Будь-яка зміна позиції/ширини (перетягування, ресайз, гравітація
    // після прибирання картки) — у localStorage. h не зберігаємо: воно
    // щоразу рахується з вмісту.
    grid.on("change", () => {
      const nodes = grid.save(false).map(({ id, x, y, w }) => ({ id, x, y, w }));
      try {
        window.localStorage.setItem(DASHBOARD_GRID_STORAGE_KEY, JSON.stringify(nodes));
      } catch {
        // Без localStorage розкладка живе до перезавантаження.
      }
    });
    // Ширина секції міняється плавно (згортання бічної панелі — 250ms
    // анімації, вікно тягнуть мишею), а власний throttle gridstack ловить
    // лише ПЕРШИЙ кадр зміни й міг пропустити кінцеву ширину — картки
    // лишались із висотою, поміряною на старій ширині (перевірено:
    // до 160px повітря знизу). Свій спостерігач із «хвостовою» затримкою
    // домірює вже на сталій ширині; onResize сам нічого не робить, якщо
    // ширина та сама.
    let settle = 0;
    const observer = new ResizeObserver(() => {
      clearTimeout(settle);
      settle = setTimeout(() => grid.el && grid.onResize(), 180);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(revealRaf);
      clearTimeout(settle);
      observer.disconnect();
      grid.destroy(false);
      gridRef.current = null;
      el.classList.remove("is-ready");
    };
  }, [hasData, storedGrid, gridEpoch]);

  // Набір видимих карток змінився (чекбокс у шторці, хрестик): React уже
  // додав/прибрав DOM-вузли, а сітка про них ще не знає. Документований
  // для фреймворків прийом gridstack — зняти всі віджети (DOM лишаємо) і
  // зареєструвати наявних дітей заново: gs-x/gs-y/gs-w на елементах
  // сітка тримає актуальними сама, тож позиції не губляться.
  const visibleKey = [...enabledCards].sort().join("|");
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const el = chartsRef.current;
    if (!grid || !el) return;
    // Вмикання/вимикання картки — це ДЕЛЬТА, а не перебудова всієї сітки.
    // Раніше тут був removeAll + makeWidget усіх заново: наявні картки
    // ставали на свої gs-x/gs-y, а нова (без збереженої позиції) падала в
    // ПЕРШУ вільну щілину зверху й розпихала все під собою — «ламала весь
    // дашборд» (скарга користувача, 2026-09-24). Тепер:
    //  • вимкнену прибираємо точково (React уже видалив її DOM — у engine
    //    лишився вузол-привид, знімаємо його);
    //  • увімкнену додаємо В НИЗ (y = поточна висота сітки), не чіпаючи
    //    жодної наявної картки; звідти її можна перетягнути куди треба.
    const domById = new Map([...el.querySelectorAll(":scope > .grid-stack-item")].map((i) => [i.getAttribute("gs-id"), i]));
    grid.batchUpdate();
    for (const node of [...grid.engine.nodes]) {
      if (node.el && !domById.has(node.el.getAttribute("gs-id"))) grid.removeWidget(node.el, false, false);
    }
    const bottom = grid.getRow();
    for (const item of domById.values()) {
      if (!item.gridstackNode) grid.makeWidget(item, { x: 0, y: bottom, w: Number(item.getAttribute("gs-w")) || 6, autoPosition: false });
    }
    grid.batchUpdate(false);
  }, [visibleKey, orderKey]);

  // Режим перетягування ↔ static-сітка. Поза режимом картки не тягнуться
  // і ручок немає — як і було з власним движком.
  useEffect(() => {
    gridRef.current?.setStatic(!editMode);
  }, [editMode, gridEpoch, hasData]);

  // Вміст карток міняється після даних (дерево команди, найскладніші
  // питання, анімація барів) — сітка міряє висоту сама (ResizeObserver у
  // sizeToContent), тут лише підштовхуємо перерахунок, коли React уже
  // домалював новий вміст.
  useEffect(() => {
    gridRef.current?.onResize();
  }, [teamTree.data, hardestQuestions.items, barsAnimated, state.data]);


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
  const ringValues = [stats.completionRate, stats.passRate, stats.onTimeRate, stats.startedRate];
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
              завантаження по Content-Disposition:attachment, без fetch+blob.
              cards= — увімкнені картки в порядку дашборда: звіт повторює
              екран лист у лист (lib/managerReport.ts). */}
          <a
            className="admin-btn-link mgr-export-link"
            href={`/api/manager/export?cards=${orderedIds.filter((id) => enabledCards.has(id)).join(",")}`}
            title="Завантажити звіт у форматі Excel — листи за увімкненими картками"
            aria-label="Завантажити звіт у форматі Excel"
          >
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

      {/* className секції СТАЛИЙ: gridstack дописує на неї власні класи
          (gs-12, grid-stack-static, grid-stack-animate) і ми — is-ready;
          зміна пропса з боку React перезаписала б атрибут цілком і стерла
          їх (спіймано живим тестом: після входу в режим редагування сітка
          лишалась visibility:hidden). Режим редагування — клас на обгортці. */}
      <div className={`mgr-charts-wrap${editMode ? " mgr-charts-edit" : ""}`}>
      <section
        key={gridEpoch}
        ref={chartsRef}
        className="mgr-section mgr-charts grid-stack"
        onPointerDown={handleCardPointerDown}
        onPointerMove={handleCardPointerMove}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
      >
        {renderChartCards([
          /* Замість п'яти KPI-плиток (2026-09-23): полоса статусів команди
            — кожна людина рівно в одному сегменті, сегмент = посилання на
            список. Звичайна картка сітки, а не окрема шапка: інакше її не
            можна було ні зменшити, ні перетягнути, ні прибрати, а висоту
            їй диктував сусід по ряду (скарга користувача: «дуже велика
            картка, вона ужимається?»). */
          ["status", enabledCards.has("status") && (
        <div className="mgr-chart-card">
          <h2>
            <PeopleIcon /> Стан команди
            <span className="admin-hint mgr-card-note">
              {team.statusBar.total} {pluralPeople(team.statusBar.total)} із призначеннями
            </span>
            <ChartHint text="Кожна людина рівно в ОДНОМУ сегменті — за найгіршим своїм станом (прострочено → відстає → не почала → неактивна → за графіком). Число в сегменті — люди; друге число поруч у легенді — скільки призначень команди в цьому стані. Клік відкриває список саме цих людей." />
          </h2>
          <TeamStatusBar data={team.statusBar} />
        </div>
          )],

          /* Топ-5 за терміновістю з кнопкою «Нагадати» — єдиний блок
            дашборда, з якого можна одразу ДІЯТИ, а не лише дивитись. */
          ["attention", enabledCards.has("attention") && (
        <div className="mgr-chart-card">
          <h2>
            <PeopleIcon /> Потребують уваги
            <ChartHint text="П'ятеро найтерміновіших: прострочення важать найбільше, далі відставання від графіка, не розпочате й відсутність на платформі. Чипи називають одиницю («2 курси прострочено»), а «Нагадати» надсилає сповіщення з готовим текстом за причиною." />
          </h2>
          <AttentionList items={team.attention} />
        </div>
          )],

          ["rings", enabledCards.has("rings") && (
        <div className="mgr-chart-card">
          <h2>
            <RingsIcon /> Показники команди
            <ChartHint text="Усі чотири кільця рахують ПРИЗНАЧЕННЯ (людина × курс), лише знаменники різні: «Виконано» — частка доведених до кінця; «Складено» — з них ті, що набрали прохідний бал курсу; «Вчасно» — вкладені в дедлайн серед тих, де дедлайн уже вирішено; «Розпочато» — ті, де є будь-який рух. Скільки ЛЮДЕЙ у якому стані — у полосі «Стан команди» вгорі. Клік веде до того, по чому треба діяти: «Вчасно» — до тих, хто не вклався, «Розпочато» — до ще не розпочатих." />
          </h2>
          {/* Кожне кільце — посилання на список за тим самим критерієм:
              «Вчасно» веде до доповнення (хто НЕ вчасно), «Розпочали» —
              до тих, хто ще не почав: діяти треба саме по них. */}
          <div className="mgr-ring-grid">
            <CompletionRing pct={stats.completionRate} label="Виконано" color={rateColor(stats.completionRate, ringValues)} href="/manager/team?view=courses&status=completed" />
            <CompletionRing pct={stats.passRate} label="Складено (80%+)" color={rateColor(stats.passRate, ringValues)} href="/manager/team?view=courses&status=passed" />
            <CompletionRing pct={stats.onTimeRate} label="Вчасно" color={rateColor(stats.onTimeRate, ringValues)} href="/manager/team?view=courses&timing=late" />
            <CompletionRing pct={stats.startedRate} label="Розпочато" color={rateColor(stats.startedRate, ringValues)} href="/manager/team?view=courses&status=not_started" />
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
                    <span className="mgr-bar-label">{b.label}</span>
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
                    <span className="mgr-bar-label">{b.label}</span>
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
      </div>

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
