// Розкладка дашборда керівника: які картки показувати, в якому порядку й
// якої ширини, і де це зберігається (localStorage — особиста зручність, не БД).

/** Вузол збереженої розкладки gridstack; pw — власна ширина картки. */
export type StoredNode = { id: string; x: number; y: number; w: number; h?: number; pw?: number };

// localStorage, не БД (рішення користувача, 2026-09-19) — вибір карток
// живе лише в цьому браузері, на іншому пристрої дашборд знову стартує з
// ролевого дефолту нижче. v1 — щоб можна було безпечно змінити формат, не
// читаючи старий несумісний масив як валідний.
// v2 (2026-09-23): у наборі з'явились "status"/"attention" — картки, яких
// у збереженому v1-списку бути не могло, тож старий вибір не підходить:
// людина з v1 просто не побачила б нових карток. Ключ змінено, дашборд
// стартує з ролевого дефолту нижче.
export const DASHBOARD_CARDS_STORAGE_KEY = "carls_manager_dashboard_cards_v2";

// Дефолт при ПЕРШОМУ заході (нема запису в localStorage — keeper сам
// нічого не вмикав/вимикав) залежить від посади: Position.code (lib/
// permissions.js isManagerTier — SV/ASM/RM_HORECA і головні HR/маркетинг/
// виробництва теж manager-tier). Реальних посад "T&D" у базі нема
// (lib/employeeDepartments.ts — лише Продажі/Виробництво/HR/Маркетинг),
// тож набір, який користувач попросив для "T&D", тут — дефолт для УСІХ
// НЕ-SV/НЕ-ASM керівників (RM, голови HR/маркетингу/виробництва): saме
// вони дивляться на команду згори, без щоденної роботи з конкретними
// людьми — той самий "зверху вниз, якість контенту" погляд.
const ROLE_DEFAULT_CARDS: Record<string, string[]> = {
  SV: ["rings", "attention", "status", "deadlines", "scoreDist", "peopleStatus"],
  ASM: ["rings", "attention", "status", "deadlines", "scoreDist", "peopleStatus"],
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

export function roleDefaultCards(positionCode: string | null | undefined): Set<string> {
  return new Set(ROLE_DEFAULT_CARDS[positionCode ?? ""] || FALLBACK_ROLE_DEFAULT_CARDS);
}

// null (а не одразу дефолтний Set) — щоб відрізнити "керівник ще нічого не
// обирав" від "обрав саме дефолтний набір": лише в першому випадку дашборд
// підставляє ролевий дефолт (roleDefaultCards) замість збереженого вибору.
export function readStoredCards(): Set<string> | null {
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
export const DASHBOARD_ORDER_STORAGE_KEY = "carls_manager_dashboard_order_v1";
// Скільки тримати палець/кнопку на картці, щоб увімкнувся режим
// перетягування — як довге натискання на іконку в iOS.
export const LONG_PRESS_MS = 450;
// Рух далі цього порога до спрацювання таймера — це скрол або виділення
// тексту, а не намір тягнути: довге натискання скасовується.
export const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

// Сітка дашборда — gridstack.js (2026-09-24, рішення користувача після
// двох власних движків: flex-wrap лишав дірки, власний grid у юнітах
// смикався при перетягуванні й розтягував картки в порожнечу).
// Модель як у Grafana: 12 віртуальних колонок, ширина картки — частка з
// них (тож згорнута бічна панель просто робить усе пропорційно ширшим,
// розкладка не міняється), висота — СТРОГО по вмісту (sizeToContent),
// картки «спливають» угору в порожнє місце (float:false), перетягування
// з плейсхолдером і автоскролом сторінки біля краю. Зберігається лише
// {x,y,w,h} по картках; старі ключі юнітів/пікселів ігноруються.
export const DASHBOARD_GRID_STORAGE_KEY = "carls_manager_dashboard_grid_v4";
// v3 — та сама розкладка, але y у клітинках по 24px; читаємо її, переводячи
// y у нові клітинки, щоб розстановка керівника не загубилась.
export const LEGACY_GRID_STORAGE_KEY = "carls_manager_dashboard_grid_v3";
// Порядок карток на телефоні (одна колонка) — окремо від розкладки на 12
// колонок (2026-10-04, баг з iPhone: «після перетягування порядок не
// зберігається»). gridstack у вузькому режимі save() віддає 12-колонкову
// розкладку, а перетягування в одній колонці переносить у неї лише
// «зсунути y на ту ж дельту» (TODO в самому gridstack-engine,
// layoutsNodesChange) — після F5 телефон виводив порядок з цієї зіпсованої
// розкладки, і заразом псувалась десктопна. Тому: телефон пише лише свій
// список id згори вниз, а 12-колонкову розкладку пише лише десктоп.
export const DASHBOARD_PHONE_ORDER_STORAGE_KEY = "carls_manager_dashboard_phone_order_v1";
// Щільність карток, 0–100 %: чим більше, тим менші поля карток. 50 — вигляд, що був до ползунка.
export const DASHBOARD_DENSITY_STORAGE_KEY = "carls_manager_dashboard_density_v1";
export const DEFAULT_DENSITY = 50;
export function readStoredDensity(): number {
  try {
    const raw = window.localStorage.getItem(DASHBOARD_DENSITY_STORAGE_KEY);
    const n = Number(raw);
    return raw !== null && Number.isInteger(n) && n >= 0 && n <= 100 ? n : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}
const LEGACY_CELL_HEIGHT_PX = 24;
export const GRID_COLUMNS = 12;
// Крок висоти. Висота «по вмісту» округлюється вгору до цілої клітинки, і
// цей залишок стає повітрям під карткою — тобто зайвим проміжком до
// сусідньої. При 24px він гуляв від 0 до 23px, і проміжки між картками
// виходили різними (скарга користувача з iPhone, 2026-10-04); при 2px —
// не більше 1px, на око рівно.
export const GRID_CELL_HEIGHT_PX = 2;
// Половина проміжку між картками: gridstack ставить margin з кожного боку.
export const GRID_MARGIN_PX = 8;
// Дефолтна ширина картки в колонках із 12 — лише ¼/½/уся (3/6/12, див.
// lib/dashboardHeights.ts snapWidth).
export const DEFAULT_CARD_W: Record<string, number> = {
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
// Мінімальна ширина за змістом (рішення користувача 2026-10-04): на ¼ —
// лише картки з короткими рядками; кільця, тренд, списки — від ½; матриця
// людей × курси — тільки на всю ширину.
const QUARTER_CARDS = new Set(["status", "deadlines", "scoreDist", "firstTry", "duration"]);
export function minCardW(id: string): number {
  if (id === "peopleStatus") return 12;
  return QUARTER_CARDS.has(id) ? 3 : 6;
}
/**
 * Стежити за висотою кожної картки сітки І її прямих дітей: картка
 * розтягнута на весь ряд (min-height:100%, manager.css), тож коли її вміст
 * росте чи меншає, власна висота картки може й не змінитись — змінюються
 * діти. observe() на вже підписаному елементі нічого не робить.
 */
export function observeCards(root: HTMLElement | null, observer: ResizeObserver | null) {
  if (!root || !observer) return;
  for (const card of root.querySelectorAll(":scope > .grid-stack-item > .grid-stack-item-content > *")) {
    observer.observe(card);
    for (const child of Array.from(card.children)) observer.observe(child);
  }
}

/**
 * Збережена розкладка gridstack: масив {id,x,y,w,h}; будь-яке сміття → null.
 * Запис без w — це записи до 2026-10-09 через grid.save(), який викидав ширину,
 * рівну мінімальній: її й повертаємо, а не відкидаємо картку.
 */
export function readStoredGrid(): StoredNode[] | null {
  if (typeof window === "undefined") return null;
  try {
    let raw = window.localStorage.getItem(DASHBOARD_GRID_STORAGE_KEY);
    let yScale = 1;
    if (!raw) {
      raw = window.localStorage.getItem(LEGACY_GRID_STORAGE_KEY);
      yScale = LEGACY_CELL_HEIGHT_PX / GRID_CELL_HEIGHT_PX;
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((n: StoredNode) => n && typeof n.id === "string" && Number.isInteger(n.x) && Number.isInteger(n.y))
      .map(({ h, ...n }: StoredNode) => ({
        ...n,
        y: n.y * yScale,
        w: Number.isInteger(n.w) ? n.w : minCardW(n.id),
        ...(Number.isInteger(h) && h! >= 1 ? { h } : {}),
      }));
  } catch {
    return null;
  }
}

export function readPhoneOrder(): string[] | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DASHBOARD_PHONE_ORDER_STORAGE_KEY) || "null");
    return Array.isArray(parsed) ? parsed.filter((id: unknown): id is string => typeof id === "string") : null;
  } catch {
    return null;
  }
}

export function readStoredOrder(): string[] | null {
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
export function mergeCardOrder(stored: string[] | null, canonical: string[]): string[] {
  if (!stored) return canonical;
  const known = new Set(canonical);
  const ordered = stored.filter((id) => known.has(id));
  const placed = new Set(ordered);
  return [...ordered, ...canonical.filter((id) => !placed.has(id))];
}

// Канонічний порядок карток — база, від якої рахується збережений порядок.
// Картку, якої тут нема, renderChartCards (ManagerDashboard.tsx) допише в
// кінець — дашборд не "втратить" її мовчки.
// Карта дашборда (користувач, 2026-10-04): кільця, «Потребують уваги»,
// «Стан команди»; далі дедлайни й розподіл балів (¼ + ¼ закривають ряд біля
// «Стану» на ½), матриця на всю ширину, решта.
export const CANONICAL_CARD_IDS: string[] = [
  "rings",
  "attention",
  "status",
  "deadlines",
  "scoreDist",
  "peopleStatus",
  "trend",
  "firstTry",
  "duration",
  "courseBreakdown",
  "hardestModules",
  "teamCompare",
  "hardestQuestions",
];
