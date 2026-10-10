"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type ReactElement } from "react";
import { XIcon, DashboardTuneIcon, ArrowsMoveIcon } from "@/components/ui/icons";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { ProfileCard } from "@/components/hub/ProfileCard";
import { startOneline, stopOneline, truncatedOnelineAt } from "@/lib/onelineMarquee";
import { useDashboardGrid } from "@/components/manager/dashboard/useDashboardGrid";
import { compareTeams, type AttentionItem, type CourseFunnel, type PersonCounts, type TeamMatrixData, type TreeNode } from "@/lib/teamInsights";
import type { DashboardStats, HardestQuestionsState, WeekTrend } from "@/components/manager/dashboard/types";
import { ManagerDashboardSettings } from "@/components/manager/ManagerDashboardSettings";
import { ExportReportLink } from "@/components/manager/ExportReportLink";
import { DashboardEditContext } from "@/components/manager/dashboard/ChartCard";
import { AttentionCard, PeopleMatrixCard, StatusCard, TeamCompareCard } from "@/components/manager/dashboard/cards/team";
import { DurationCard, FirstTryCard, RingsCard, TrendCard } from "@/components/manager/dashboard/cards/progress";
import { CourseBreakdownCard, DeadlinesCard, HardestModulesCard, HardestQuestionsCard, ScoreDistCard } from "@/components/manager/dashboard/cards/courses";
import {
  CANONICAL_CARD_IDS,
  DASHBOARD_CARDS_STORAGE_KEY,
  DASHBOARD_DENSITY_STORAGE_KEY,
  DASHBOARD_GRID_STORAGE_KEY,
  DASHBOARD_ORDER_STORAGE_KEY,
  DASHBOARD_PHONE_ORDER_STORAGE_KEY,
  DEFAULT_CARD_W,
  DEFAULT_DENSITY,
  LEGACY_GRID_STORAGE_KEY,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  LONG_PRESS_MS,
  mergeCardOrder,
  minCardW,
  readStoredCards,
  readStoredDensity,
  readStoredGrid,
  readStoredOrder,
  roleDefaultCards,
  type StoredNode,
} from "@/components/manager/dashboard/layout";

// Картки, чиє заповнення вже зіграло в цьому завантаженні сторінки (користувач,
// 2026-10-05: «один раз при перезагрузке чи вході, не щоразу, коли картка
// потрапляє в кадр — усе мигає»). Живе в модулі, тож переживає повернення на
// «Головну» з іншої вкладки (SPA-навігація), а F5 чи новий вхід в застосунок
// обнуляють його разом зі сторінкою.
const playedCards = new Set<string>();

/** lib/managerOverview.js getManagerOverview — те, що читає дашборд. */
type DashboardData = {
  me: {
    name: string;
    levelLabel: string;
    avatarUrl?: string | null;
    stats?: ComponentProps<typeof ProfileCard>["stats"];
    position?: { code?: string | null } | null;
  };
  team: {
    statusBar: ComponentProps<typeof StatusCard>["statusBar"];
    attention: AttentionItem[];
    matrix: TeamMatrixData;
    stats: DashboardStats;
    weeklyTrend: WeekTrend[];
    funnels: CourseFunnel[];
    summaryByEmployeeId: Record<number, PersonCounts>;
  };
};

/**
 * Головна кабінету керівника (/manager): профіль і сітка карток-діаграм, які
 * людина вмикає, переставляє й розтягує (gridstack). Дані — з сервера
 * (app/manager/page.js → lib/managerOverview.js); «Найскладніші питання» й
 * дерево для «Порівняння команд» вантажаться окремо, лише коли картка потрібна.
 */
export function ManagerDashboard({ initialData = null, initialError = false }: { initialData?: DashboardData | null; initialError?: boolean }) {
  // Дані вже прийшли з сервера (app/manager/page.js, lib/managerOverview.js)
  // — loading:false одразу, без окремого клієнтського fetch() і
  // скелетон-спалаху на кожному монтуванні (раніше тут стояв fetch(
  // "/api/manager/overview") в ефекті нижче; той JSON-роут не брав участі
  // в client Router Cache, тож екран лишався найважчим навіть після
  // кешування enrollments — аудит "быстродействия не почувствовал",
  // 2026-09-19).
  const [state, setState] = useState<{ loading: boolean; data: DashboardData | null; error: boolean }>({ loading: false, data: initialData, error: initialError });
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
  const [cardOverride, setCardOverride] = useState<Set<string> | null>(null);
  const enabledCards = cardOverride ?? roleDefaultCards(state.data?.me?.position?.code);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Щільність карток (ползунок у налаштуваннях). Дефолт на сервері, збережене — в ефекті нижче (як cardOverride).
  const [density, setDensity] = useState(DEFAULT_DENSITY);
  function changeDensity(next: number) {
    setDensity(next);
    try {
      window.localStorage.setItem(DASHBOARD_DENSITY_STORAGE_KEY, String(next));
    } catch {
      // Без localStorage щільність живе до перезавантаження.
    }
  }
  // "Найскладніші питання" — єдина з нових карток, що рахується окремим
  // запитом (lib/managerDashboard.js getHardestQuestions), а не з уже
  // завантаженого /api/manager/overview: вимкнена за замовчуванням, тож
  // зайвий запит до бази не повинен виконуватись, поки керівник сам її
  // не увімкнув.
  const [hardestQuestions, setHardestQuestions] = useState<HardestQuestionsState>({ loading: false, items: null, error: false });
  // "Запит уже пішов" — саме ref, а не стан: стан у залежностях ефекту
  // перезапускав би його сам на себе (див. коментар при ефекті нижче).
  const hardestQuestionsRequestedRef = useRef(false);
  // Дерево команди потрібне лише картці «Порівняння команд» — окремий запит
  // /api/manager/team-tree, коли картка вперше наближається до екрана.
  const [teamTree, setTeamTree] = useState<{ loading: boolean; data: TreeNode[] | null; error: boolean }>({ loading: false, data: null, error: false });
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
  const [storedOrder, setStoredOrder] = useState<string[] | null>(null);
  // Збережена розкладка gridstack (readStoredGrid) — підхоплюється тим же
  // ефектом, що й решта налаштувань, і застосовується при ініціалізації
  // сітки (grid.load) нижче. null — ще не читали; [] — нічого не збережено.
  const [storedGrid, setStoredGrid] = useState<StoredNode[] | null>(null);
  // Скидання розкладки перемонтовує сітку (key на секції): простіше й
  // надійніше, ніж повертати кожній картці дефолт через API gridstack.
  const [gridEpoch, setGridEpoch] = useState(0);
  // Сітка показана (.is-ready). До цього картки під visibility:hidden — графіки
  // мають чекати, інакше відіграють заповнення невидимими (inView нижче).
  const [gridReady, setGridReady] = useState(false);
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
    setDensity(readStoredDensity());
    const order = readStoredOrder();
    if (order) setStoredOrder(order);
    setStoredGrid(readStoredGrid() || []);
  }, []);
  const chartsRef = useRef<HTMLElement>(null);
  const [editMode, setEditMode] = useState(false);
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout>; startX: number; startY: number } | null>(null);

  function toggleCard(id: string) {
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
      window.localStorage.removeItem(LEGACY_GRID_STORAGE_KEY);
      window.localStorage.removeItem(DASHBOARD_PHONE_ORDER_STORAGE_KEY);
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

  // Клік по СМУЗІ нативного вертикального скролбару всередині картки
  // (список, таблиця «Люди × курси» — .mgr-chart-card > .mgr-matrix-wrap/ul,
  // overflow:auto) репортить target як сам прокручуваний контейнер: нативний
  // скролбар — не DOM-вузол, відрізнити «взяв повзунок» від «взяв картку»
  // інакше не можна. Йдемо від target угору до межі картки, шукаючи
  // прокручуваного предка, і перевіряємо, чи X-координата влучає в його
  // праву смугу шириною зі скролбар (offsetWidth-clientWidth). Без цього
  // тягання повзунка починало довге натискання й картка «трусилась», ніби
  // ось-ось піде в перетягування (скарга користувача, 2026-09-27).
  function isScrollbarPointerDown(e: React.PointerEvent) {
    let node: Element | null = e.target as Element;
    while (node instanceof Element && !node.matches("[data-card-id]")) {
      const cs = getComputedStyle(node);
      const scrollsY = (cs.overflowY === "auto" || cs.overflowY === "scroll") && node.scrollHeight > node.clientHeight;
      const scrollbarWidth = (node as HTMLElement).offsetWidth - node.clientWidth;
      if (scrollsY && scrollbarWidth > 0 && e.clientX >= node.getBoundingClientRect().right - scrollbarWidth) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  // Довге натискання на картку вмикає режим перетягування — як на іконку
  // в iOS. Саме перетягування далі веде gridstack (сітка стає
  // не-static в ефекті нижче); наступне натискання вже тягне картку.
  // Обробники — на секції (делегування), а не на кожній картці.
  // Однорядкові підписи карток (lib/onelineMarquee.ts): миша — біжить, поки
  // наведена; тап по обрізаному підпису — один прохід замість переходу за
  // посиланням рядка, другий тап — уже звичайний перехід.
  const lastPointerTypeRef = useRef<string>("mouse");
  function handleOnelineOver(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    const el = truncatedOnelineAt(e.target);
    if (el) startOneline(el, false);
  }
  function handleOnelineOut(e: React.PointerEvent) {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>(".is-scrolling:not(.is-once)");
    if (el && !el.contains(e.relatedTarget as Node | null)) stopOneline(el);
  }
  function handleOnelineTap(e: React.MouseEvent) {
    if (lastPointerTypeRef.current === "mouse" || editMode) return;
    const el = truncatedOnelineAt(e.target);
    if (!el || el.classList.contains("is-scrolling")) return;
    e.preventDefault();
    e.stopPropagation();
    startOneline(el, true);
  }

  function handleCardPointerDown(e: React.PointerEvent) {
    lastPointerTypeRef.current = e.pointerType;
    const target = e.target as Element;
    if (editMode || !target?.closest?.("[data-card-id]")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Посилання й кнопки всередині картки — це клік, не «взяти картку».
    if (target.closest("a, button, input, select")) return;
    // Таблиця (матриця «Люди × курси»): тут тягнуть межі колонок і рядків і
    // скролять її вбік — довге натискання пальцем на комірку/межу вмикало б
    // режим перетягування й картка «трусилась» (скарга користувача, 2026-10-05).
    if (target.closest("table")) return;
    if (isScrollbarPointerDown(e)) return;
    const { clientX, clientY } = e;
    const timer = setTimeout(() => {
      longPressRef.current = null;
      setEditMode(true);
    }, LONG_PRESS_MS);
    longPressRef.current = { timer, startX: clientX, startY: clientY };
  }

  function handleCardPointerMove(e: React.PointerEvent) {
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
   */
  function renderChartCards(entries: [string, ReactElement | false][]) {
    const visible = entries.filter((entry): entry is [string, ReactElement] => Boolean(entry[1]));
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
        <div key={id} className="grid-stack-item" data-card-id={id} data-played={playedAtMount.has(id) ? "" : undefined} data-live={inView.has(id) ? "" : undefined} gs-id={id} gs-w={DEFAULT_CARD_W[id] || 6} gs-min-w={minCardW(id)}>
          <div className="grid-stack-item-content">
            {node}
          </div>
          {removeButton}
        </div>
      );
    });
  }

  const hasData = Boolean(state.data);
  useDashboardGrid({ chartsRef, hasData, storedGrid, setStoredGrid, gridEpoch, setGridEpoch, setGridReady, editMode, enabledCards, orderKey, density });

  // Клік повз картки виходить із режиму перетягування — як тап по вільному
  // місцю екрана на iPhone (запит користувача). Слухач на документі, а не
  // на секції: "вільне місце" — це і все, що нижче сітки, не лише проміжки
  // між картками. Кнопки режиму й шторку налаштувань виключаємо, інакше
  // натискання на "Готово"/шестерню закривало б режим двічі.
  useEffect(() => {
    if (!editMode) return undefined;
    function handleOutsidePointerDown(e: PointerEvent) {
      if ((e.target as Element | null)?.closest?.("[data-card-id], .mgr-dashboard-done-btn, .mgr-dashboard-settings-btn, .mgr-drawer")) {
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


  // Дерево вантажиться, лише коли картка «Порівняння команд» увімкнена й
  // наближається до екрана (150px запасу); ensureTeamTree() ідемпотентний.
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

  // Графіки картки заповнюються з нуля ОДИН раз за завантаження сторінки — коли
  // картка вперше з’являється на екрані (кільця крутяться, смуги й сегменти
  // ростуть). Далі вона лишається заповненою: ні вихід із кадру, ні повернення
  // на «Головну» з іншої вкладки анімацію не повторюють. -15% знизу: стартуємо,
  // коли картку вже видно, а не на самому краї.
  // playedAtMount — що зіграло ДО цього монтування: такі картки малюємо одразу
  // готовими (без дуги й CSS-анімацій).
  const [playedAtMount] = useState(() => new Set(playedCards));
  const [inView, setInView] = useState<Set<string>>(() => new Set(playedCards));
  const enabledKey = orderedIds.filter((id) => enabledCards.has(id)).join(",");
  useEffect(() => {
    const root = chartsRef.current;
    if (!root || !gridReady || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(
      (entries) =>
        setInView((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const id = e.target.getAttribute("data-card-id");
            if (e.isIntersecting && id) {
              next.add(id);
              playedCards.add(id);
            }
          }
          return next.size === prev.size ? prev : next;
        }),
      { rootMargin: "0px 0px -15% 0px" }
    );
    root.querySelectorAll("[data-card-id]").forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, [enabledKey, state.data, gridReady, gridEpoch]);
  const live = (id: string) => barsAnimated && inView.has(id);

  // "Порівняння команд" (нова картка, блок АСМ) — кожен ПРЯМИЙ підлеглий
  // керівника (для АСМ — його СВ, для СВ — просто кожна людина окремо,
  // деградує до "команди з однієї людини", теж має сенс), з підсумком по
  // ВСЬОМУ його піддереву (він сам + всі його підлеглі), не лише власними
  // enrollments.
  const teamCompare = useMemo(() => {
    if (!state.data || !teamTree.data) return [];
    const summaryMap = state.data.team.summaryByEmployeeId;
    return compareTeams(teamTree.data, (id: number) => summaryMap[id]);
  }, [state.data, teamTree.data]);


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
  const { stats, weeklyTrend, funnels } = team;
  const play = (id: string) => ({ active: inView.has(id), instant: playedAtMount.has(id) });

  return (
    <div className="admin-page manager-page">
      <div className="mgr-page-header">
        <h1 className="greeting hub-greeting-h1">КАБІНЕТ КЕРІВНИКА</h1>
        <div className="mgr-page-header-actions">
          {/* Excel-звіт: листи за увімкненими картками в порядку дашборда. */}
          <ExportReportLink cards={orderedIds.filter((id) => enabledCards.has(id))} />
          {/* Навмисно ІНША іконка, ніж загальні налаштування застосунку
              (components/ui/icons.jsx DashboardTuneIcon) — щоб "які графіки
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
          density={density}
          onDensity={changeDensity}
        />
      )}

      {/* Клікабельна → "Досягнення" з підсвіткою картки рейтингу, той самий
          підхід, що й на /hub (2026-09-22, рішення користувача:
          "унифицировать подходы"). externalCode прибрано — ProfileCard.jsx
          більше не приймає й не показує цей пропс (той самий фікс, що вже
          був на /hub). */}
      <ProfileCard
        dbName={me.name}
        levelLabel={me.levelLabel}
        avatarUrl={me.avatarUrl}
        stats={me.stats}
        href="/manager/achievements?highlight=rating"
      />

      {/* className секції СТАЛИЙ: gridstack дописує на неї власні класи
          (gs-12, grid-stack-static, grid-stack-animate) і ми — is-ready;
          зміна пропса з боку React перезаписала б атрибут цілком і стерла
          їх (спіймано живим тестом: після входу в режим редагування сітка
          лишалась visibility:hidden). Режим редагування — клас на обгортці. */}
      <div className={`mgr-charts-wrap${editMode ? " mgr-charts-edit" : ""}`} style={{ "--mgr-density": density } as CSSProperties}>
      <section
        key={gridEpoch}
        ref={chartsRef}
        className="mgr-section mgr-charts grid-stack"
        onPointerDown={handleCardPointerDown}
        onPointerMove={handleCardPointerMove}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerOver={handleOnelineOver}
        onPointerOut={handleOnelineOut}
        onClickCapture={handleOnelineTap}
      >
        <DashboardEditContext value={editMode}>
          {renderChartCards([
            ["status", enabledCards.has("status") && <StatusCard statusBar={team.statusBar} />],
            ["attention", enabledCards.has("attention") && <AttentionCard items={team.attention} />],
            ["rings", enabledCards.has("rings") && <RingsCard stats={stats} play={play("rings")} />],
            ["trend", enabledCards.has("trend") && <TrendCard weeks={weeklyTrend} live={live("trend")} />],
            ["deadlines", enabledCards.has("deadlines") && <DeadlinesCard buckets={stats.deadlineHorizon} live={live("deadlines")} />],
            ["scoreDist", enabledCards.has("scoreDist") && <ScoreDistCard buckets={stats.scoreDistribution} live={live("scoreDist")} />],
            ["firstTry", enabledCards.has("firstTry") && <FirstTryCard firstAttempt={stats.firstAttempt} play={play("firstTry")} />],
            ["duration", enabledCards.has("duration") && <DurationCard durations={stats.durations} live={live("duration")} />],
            [
              "courseBreakdown",
              enabledCards.has("courseBreakdown") && <CourseBreakdownCard courses={stats.courseBreakdown} funnels={funnels} live={live("courseBreakdown")} />,
            ],
            ["hardestModules", enabledCards.has("hardestModules") && <HardestModulesCard modules={stats.hardestModules} live={live("hardestModules")} />],
            ["peopleStatus", enabledCards.has("peopleStatus") && <PeopleMatrixCard matrix={team.matrix} />],
            [
              "teamCompare",
              enabledCards.has("teamCompare") && (
                <TeamCompareCard loaded={Boolean(teamTree.data)} teams={teamCompare} live={live("teamCompare")} cardRef={teamCompareSectionRef} />
              ),
            ],
            ["hardestQuestions", enabledCards.has("hardestQuestions") && <HardestQuestionsCard state={hardestQuestions} live={live("hardestQuestions")} />],
          ])}
        </DashboardEditContext>
      </section>
      </div>

    </div>
  );
}
