"use client";

import { useEffect, useLayoutEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import { GridStack, type GridItemHTMLElement, type GridStackNode } from "gridstack";
import { hasHoles, holeFillSteps, snapWidth, standardRows } from "@/lib/dashboardHeights";
import {
  DASHBOARD_GRID_STORAGE_KEY,
  DASHBOARD_PHONE_ORDER_STORAGE_KEY,
  DEFAULT_CARD_W,
  GRID_CELL_HEIGHT_PX,
  GRID_COLUMNS,
  GRID_MARGIN_PX,
  minCardW,
  observeCards,
  readPhoneOrder,
  readStoredGrid,
  type StoredNode,
} from "@/components/manager/dashboard/layout";

/** id вузла gridstack — завжди id картки (gs-id). */
const nodeId = (n: GridStackNode) => String(n.id);

/** Розміщені вузли сітки як прямокутники (x, y, w, h) — для lib/dashboardHeights.ts. */
function gridBoxes(grid: GridStack): (StoredNode & { h: number })[] {
  return grid.engine.nodes
    .filter((n) => n.el)
    .map((n) => ({ id: nodeId(n), x: n.x ?? 0, y: n.y ?? 0, w: n.w ?? 1, h: n.h ?? 1 }));
}

/**
 * Сітка карток дашборда на gridstack: ініціалізація зі збереженої розкладки,
 * висоти S/L за вмістом без дір (fitCards), телефонний порядок, повернення з
 * телефонної ширини, вмикання/вимикання карток і режим перестановки. Правила —
 * .claude/rules/manager-dashboard.md; кожна гілка тут — з живого дефекту.
 */
export function useDashboardGrid({
  chartsRef,
  hasData,
  storedGrid,
  setStoredGrid,
  gridEpoch,
  setGridEpoch,
  setGridReady,
  editMode,
  enabledCards,
  orderKey,
  density,
}: {
  chartsRef: RefObject<HTMLElement | null>;
  hasData: boolean;
  storedGrid: StoredNode[] | null;
  setStoredGrid: Dispatch<SetStateAction<StoredNode[] | null>>;
  gridEpoch: number;
  setGridEpoch: Dispatch<SetStateAction<number>>;
  setGridReady: Dispatch<SetStateAction<boolean>>;
  editMode: boolean;
  enabledCards: Set<string>;
  orderKey: string;
  density: number;
}) {
  // Екземпляр gridstack живе в ref, не в стані: React про його зміни
  // знати не мусить, вони не впливають на розмітку карток.
  const gridRef = useRef<GridStack | null>(null);
  // Спостерігач висоти карток (ініціалізація сітки) — ефект видимості
  // підписує на нього щойно ввімкнені картки.
  const cardObserverRef = useRef<ResizeObserver | null>(null);
  const fitCardsRef = useRef<((opts?: { resetWidths?: boolean }) => void) | null>(null);
  const visibleSigRef = useRef<string | null>(null);

  // ---- gridstack: ініціалізація ----
  // Один раз на монтування секції (gridEpoch міняє key — тоді заново).
  // Існуючі DOM-діти секції стають віджетами (init читає gs-* атрибути),
  // збережені позиції накладаються через load() по gs-id. Картки, яких у
  // збереженому нема (нова картка, увімкнена пізніше), стають в кінець
  // (autoPosition) — гравітація підбирає їх угору сама.
  // useLayoutEffect: до першого пейнту, інакше кадр із картками, звалени-
  // ми в кут (до init усі .grid-stack-item лежать absolute у 0,0).
  useLayoutEffect(() => {
    const el = chartsRef.current;
    if (!el || !hasData || storedGrid === null || gridRef.current) return undefined;
    const grid = GridStack.init(
      {
        column: GRID_COLUMNS,
        cellHeight: GRID_CELL_HEIGHT_PX,
        margin: GRID_MARGIN_PX,
        mode: "top",
        // Стартуємо БЕЗ анімації: розстановка збереженої розкладки
        // (grid.load) і перший замір висот під вміст (sizeToContent) —
        // це не «керівник щось перетягнув», а відновлення стану, і
        // анімувати його означало показати, як картки «стрибають» у свої
        // місця на кожному перезавантаженні (скарга користувача,
        // 2026-09-24). Вмикаємо анімацію нижче, коли розкладка вже стала.
        animate: false,
        // Висоти рахує fitCards нижче (по вмісту + вирівнювання ряду), не
        // вбудований sizeToContent: той міряє саму картку, а вона розтягнута
        // на висоту ряду, тож зменшитись після вирівнювання вже не могла б.
        sizeToContent: false,
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
    // Джерело — НАЙСВІЖІША збережена розкладка (localStorage), а не стан storedGrid з першого
    // монтування: сітку пересоздають і при повторному показі вкладки (Next Activity), і там
    // стан уже застарів відносно того, що людина встигла перетягнути.
    const latestStored = readStoredGrid();
    const source = latestStored && latestStored.length > 0 ? latestStored : storedGrid;
    const fresh = source.length === 0;
    // Збережена розкладка — з висотами (h): сітка одразу стає як була, fitCards лише перевіряє.
    // Без висот картки стартували б з 1 клітинки й «виростали» по одній, а гравітація з
    // ущільненням тим часом переставляли сітку — і F5, і повторний показ вкладки (Next
    // Activity), і повернення з телефонної ширини давали б кожне свою розкладку.
    if (!fresh) grid.load(source, false);
    // Ширини лише ¼/½/уся (lib/dashboardHeights.ts): довільна ширина зі
    // старої розкладки чи з ручки — до найближчої дозволеної. На телефоні
    // (одна колонка) ширина одна для всіх — нічого не чіпаємо.
    // Власна ширина картки (дефолтна або виставлена ручкою; у localStorage —
    // поле pw) окремо від поточної: розтягування, яким fitCards закриває
    // діри, — тимчасове. Перед кожним перепакуванням картки повертаються до
    // своєї ширини, і лише тоді діри закриваються наново — інакше картки,
    // увімкнені по одній, ставали кожна смугою на всю ширину й такими й
    // лишались (живий тест 2026-10-04).
    const prefW = new Map(source.map((n) => [n.id, Number.isInteger(n.pw) ? n.pw : n.w]));
    const prefOf = (n: GridStackNode) => snapWidth(prefW.get(nodeId(n)) ?? DEFAULT_CARD_W[nodeId(n)] ?? 6, minCardW(nodeId(n)));
    const snapWidths = () => {
      if (grid.getColumn() !== GRID_COLUMNS) return;
      for (const n of [...grid.engine.nodes]) {
        const w = snapWidth(n.w ?? 1, minCardW(nodeId(n)));
        if (n.el && w !== n.w) grid.update(n.el, { w });
      }
    };
    snapWidths();
    // Телефон: накласти власний збережений порядок. Через load(), а не
    // update(): load не переносить зміни в 12-колонковий кеш gridstack.
    // Картки, яких у списку нема (увімкнені пізніше), — в кінець, у тому
    // порядку, що дав gridstack.
    const applyPhoneOrder = () => {
      if (grid.getColumn() !== 1) return;
      const order = readPhoneOrder();
      if (!order) return;
      const rank = new Map(order.map((id, i) => [id, i]));
      const nodes = grid.engine.nodes.filter((n) => n.el).sort((a, b) => (rank.get(nodeId(a)) ?? order.length + (a.y ?? 0)) - (rank.get(nodeId(b)) ?? order.length + (b.y ?? 0)));
      let y = 0;
      const items = nodes.map((n) => {
        const item = { id: n.id, x: 0, y, w: 1, h: n.h };
        y += n.h || 1;
        return item;
      });
      grid.load(items, false);
    };
    applyPhoneOrder();
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
        // Анімація позицій/розмірів сітки лишається ВИМКНЕНОЮ: fitCards після показу ще кілька
        // разів міняє розміри карток, і 0.3s-перехід на кожну зміну давав зворотний зв’язок —
        // спостерігач розмірів реагував на кожен кадр переходу й запускав перерахунок знову
        // (≈15 проходів і сотні перерахунків стилів щоразу, як вкладку «Головна» показують знову;
        // при ×4 CPU повернення на дашборд займало ~5 с). Анімація — лише після жесту людини.
        el.classList.add("is-ready");
        setGridReady(true);
      });
    });
    // Повернення з телефонної ширини. gridstack при поверненні з 1 колонки сам перераховує позиції
    // (moveScale) і збиває порядок («Стан команди» першим, «Дедлайни» на всю
    // ширину — знайдено прогоном сценаріїв 2026-10-05, ловиться при повороті
    // планшета чи звуженні вікна), а подія change одразу записала б цю
    // зіпсовану розкладку в localStorage. Тому під час переходу (свіжий resize
    // вікна) не зберігаємо, а після нього сітка створюється заново (див. нижче).
    let transitionUntil = 0;
    const markTransition = () => {
      transitionUntil = Date.now() + 600;
    };
    window.addEventListener("resize", markTransition);
    // Колонка, яку бачив попередній спостерігач розміру (нижче): gridstack перемикає колонки у
    // власному обробнику resize, РАНІШЕ за наш (з затримкою), тож перехід 1 → 12 впізнаємо лише
    // за запам’ятаною.
    let prevCol = grid.getColumn();
    // Повернулись із однієї колонки, а сітку ще не пересоздали: позиції — від moveScale, висоти —
    // телефонні. fitCards тут «лагодив» би діри (розтягував картки на всю ширину), а його
    // відкладені проходи виходили за вікно transitionUntil і записували це в localStorage —
    // пересоздана сітка читала вже зіпсовану розкладку. До пересоздання не міряємо й не пишемо.
    const returningFromPhone = () => prevCol === 1 && grid.getColumn() === GRID_COLUMNS;
    // Будь-яка зміна позиції/розміру (перетягування, ресайз, гравітація
    // після прибирання картки, нова висота з fitCards) — у localStorage.
    // h теж: без нього F5 ставив усі картки висотою в 1 клітинку, і поки
    // fitCards їх наростив, гравітація й ущільнення переставляли сітку інакше,
    // ніж її залишили (і інакше, ніж повернення з телефона, — там висоти є).
    const saveLayout = () => {
      // На телефоні 12-колонкову розкладку не пишемо — див. DASHBOARD_PHONE_ORDER_STORAGE_KEY.
      if (grid.getColumn() !== GRID_COLUMNS || returningFromPhone()) return;
      if (Date.now() < transitionUntil) return;
      // Не grid.save(): він викидає w, що дорівнює minW (і h = 1), а readStoredGrid такий запис
      // без ширини вважав зіпсованим — після F5 ці картки ставали куди вийде.
      const nodes = gridBoxes(grid).map((n) => ({ ...n, pw: prefW.get(n.id) ?? DEFAULT_CARD_W[n.id] ?? n.w }));
      try {
        window.localStorage.setItem(DASHBOARD_GRID_STORAGE_KEY, JSON.stringify(nodes));
      } catch {
        // Без localStorage розкладка живе до перезавантаження.
      }
    };
    grid.on("change", saveLayout);
    // Картка, яку тягнуть/ресайзять, сама пропускає 300ms CSS-transition
    // (.ui-draggable-dragging/.ui-resizable-resizing в gridstack.min.css) —
    // а СУСІДИ, яких вона живо виштовхує (float:false, гравітація рахується
    // на кожен mousemove, не лише на відпускання), ні. Кожен зсув сусіда
    // під час тягання перезапускає його ж transition, і оскільки mousemove
    // сипле оновлення набагато частіше за 300ms — transition раз у раз
    // обривається на середині й стартує заново, картка «трясеться» замість
    // плавного руху (скарга користувача, 2026-09-26: тряска саме під час
    // розтягування картки за ширину). Вимикаємо анімацію на весь грід на
    // час активного жесту (як і setAnimation(true) нижче в reveal —
    // той самий перемикач), вмикаємо назад на відпускання.
    // Поки картку тягнуть чи міняють ширину — висоти не чіпаємо (інакше
    // сусіди «повзуть» просто під рукою); перерахунок — на відпускання.
    let gesture = false;
    grid.on("dragstart resizestart", () => {
      gesture = true;
      grid.setAnimation(false);
    });
    grid.on("dragstop resizestop", (event: Event, item: GridItemHTMLElement) => {
      gesture = false;
      // Після жесту сусіди плавно займають місце, потім анімація знову вимкнена.
      grid.setAnimation(true);
      setTimeout(() => grid.el && grid.setAnimation(false), 600);
      snapWidths();
      if (event.type === "dragstop" && grid.getColumn() === 1) {
        const ids = grid.engine.nodes.filter((n) => n.el).sort((a, b) => (a.y ?? 0) - (b.y ?? 0)).map((n) => n.id);
        try {
          window.localStorage.setItem(DASHBOARD_PHONE_ORDER_STORAGE_KEY, JSON.stringify(ids));
        } catch {
          // Без localStorage порядок живе до перезавантаження.
        }
      }
      // Ширину виставила людина — це тепер власна ширина картки.
      // Зберегти одразу: якщо після цього розкладка не зрушить, події change
      // не буде, і нова власна ширина після F5 загубилась би (живий тест).
      if (event.type === "resizestop" && item?.gridstackNode) {
        prefW.set(nodeId(item.gridstackNode), item.gridstackNode.w ?? 1);
        saveLayout();
      }
      // Ширину картки змінили — її вміст, а з ним S чи L, міг змінитись.
      fitCardsRef.current?.({ resetWidths: true });
    });
    // Ширина секції міняється плавно (згортання бічної панелі — 250ms
    // анімації, вікно тягнуть мишею), а власний throttle gridstack ловить
    // лише ПЕРШИЙ кадр зміни й міг пропустити кінцеву ширину — картки
    // лишались із висотою, поміряною на старій ширині (перевірено:
    // до 160px повітря знизу). Свій спостерігач із «хвостовою» затримкою
    // домірює вже на сталій ширині; onResize сам нічого не робить, якщо
    // ширина та сама.
    let settle: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        if (!grid.el) return;
        const was = grid.getColumn();
        grid.onResize();
        // Щойно перейшли у вузький режим (поворот, звузили вікно) —
        // gridstack вивів порядок із 12 колонок; повертаємо телефонний.
        if (was !== 1) applyPhoneOrder();
        // Повернулись на широкий екран (поворот планшета, розширили вікно).
        // prevCol при поверненні не оновлюємо: ця сітка до пересоздання лишається «в переході»
        // (returningFromPhone) і нічого не міряє й не пише.
        if (returningFromPhone()) {
          // Пересоздаємо сітку з збереженої розкладки — як після F5. Точкове
          // відновлення позицій (grid.load) не тримається: наступний прохід
          // fitCards бачить «діри» (висоти змінились на телефоні) і розтягує
          // сусідів на всю ширину. Збережена розкладка чиста (див. returningFromPhone).
          setStoredGrid(readStoredGrid() || []);
          setGridEpoch((n) => n + 1);
        } else {
          prevCol = grid.getColumn();
        }
      }, 180);
    });
    observer.observe(el);
    // Висоти карток (2026-10-04). Природна висота — від верху картки до низу
    // її найнижчого блока (сама картка розтягнута на висоту клітинки й для
    // цього не годиться). На десктопі — лише стандартні S або L = 2 × S
    // (lib/dashboardHeights.ts standardRows): картки складаються як цеглинки,
    // без дір. На телефоні (одна колонка) рівняти нема з чим — кожна картка
    // рівно по вмісту, без повітря.
    // Чому не вбудований перемір gridstack: він іде всередині batchUpdate,
    // і там частина нових висот не застосовується (живий замір — вміст
    // 439px, картка 200px), а після переходу в одну колонку нижню картку
    // не відсуває (на телефоні «attention» 137…314, а «trend» на 168).
    // Тому — по одній картці без batch і в кінці перевірка перетинів:
    // compact("list") зберігає порядок і лише щільно складає (намірених
    // проміжків при float:false і так не буває).
    // offsetTop/offsetHeight, не getBoundingClientRect: у режимі перестановки
    // картка хитається (rotate), і її описаний прямокутник на 2–3px вищий —
    // кожен жест дорощував картку на всю ширину, а S на межі перескакувала в L
    // (2026-10-08). Offset-метрики трансформацій не бачать.
    const naturalPx = (n: GridStackNode) => {
      const content = n.el?.querySelector(".grid-stack-item-content");
      const card = content?.firstElementChild;
      if (!card) return 0;
      let bottom = 0;
      for (const child of Array.from(card.children) as HTMLElement[]) {
        // + нижній margin блока (у <p>/<ul> він є) — інакше картка вилазила
        // за свою клітинку на ці пікселі й з'їдала проміжок до сусідньої.
        if (child.getClientRects().length) {
          bottom = Math.max(bottom, child.offsetTop + child.offsetHeight + (parseFloat(getComputedStyle(child).marginBottom) || 0));
        }
      }
      const cs = getComputedStyle(card);
      return bottom + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    };
    // Проміжок між картками по вертикалі = margin сітки зверху й знизу.
    const GAP_PX = 2 * GRID_MARGIN_PX;
    // grid.update() сам синхронно шле resizecontent — без прапорця fitCards
    // викликав би себе ж нескінченно.
    let fitting = false;
    // Запобіжник: якщо розкладка раптом не сходиться (кожен прохід змінює
    // розміри — ResizeObserver кличе знову), більше 20 проходів на секунду
    // не робимо — сторінка не має зависати (живий тест 2026-10-04).
    let burstStart = 0;
    let burstRuns = 0;
    // Пропущений через запобіжник прохід не губиться — відкладається на кінець
    // секунди (з resetWidths, якщо його просили хоч раз), щоб розкладка все
    // одно дійшла до кінця.
    let deferred: ReturnType<typeof setTimeout> | 0 = 0;
    let deferredReset = false;
    // resetWidths — повернути картки до власних ширин перед перепакуванням.
    // Лише на структурних подіях (завантаження, увімкнули/вимкнули картку,
    // змінили ширину ручкою), не на кожен перемір вмісту: інакше кожен
    // прохід перетасовував позиції й розкладка ганялась по колу.
    const fitCards = ({ resetWidths = false } = {}) => {
      if (!grid.el || fitting || gesture || returningFromPhone()) return;
      const now = performance.now();
      if (now - burstStart > 1000) {
        burstStart = now;
        burstRuns = 0;
      }
      if (++burstRuns > 20) {
        deferredReset ||= resetWidths;
        if (!deferred) {
          deferred = setTimeout(() => {
            const reset = deferredReset;
            deferred = 0;
            deferredReset = false;
            fitCards({ resetWidths: reset });
          }, Math.max(0, 1000 - (now - burstStart)) + 16);
        }
        return;
      }
      fitting = true;
      try {
        const cell = grid.getCellHeight(true);
        const phone = grid.getColumn() === 1;
        if (resetWidths && !phone) {
          for (const n of [...grid.engine.nodes]) {
            const w = prefOf(n);
            if (n.el && n.w !== w) grid.update(n.el, { w });
          }
          // Ущільнити одразу, а не лише коли є «діра»: вільна половина праворуч
          // від картки, під якою нікого (кінець дашборда), діркою не рахується,
          // і без цього щойно ввімкнена картка лишалась рядом нижче, а сусід
          // знову розтягувався на всю ширину.
          grid.compact("compact");
        }
        const nodes = grid.engine.nodes.filter((n) => n.el).sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
        // Міряємо без вертикального центрування вмісту (.is-measuring,
        // manager.css): з ним блоки зсунуті вниз на половину вільного місця,
        // і «природна» висота картки L ніколи не опустилась би назад до S.
        // Клас знімається в тому ж кадрі — ResizeObserver цього не бачить.
        el.classList.add("is-measuring");
        const natural = new Map(nodes.map((n) => [n, naturalPx(n)]));
        el.classList.remove("is-measuring");
        // Згори вниз — щоб вирівнювання верхніх карток не смикало нижні двічі.
        for (const n of nodes) {
          const px = natural.get(n);
          if (!n.el) continue;
          if (!px) continue;
          // Картка на всю ширину рядка (матриця «люди × курси») сусідів по ряду не має,
          // тож рівнятись на S/L їй нема з чим — висота рівно по вмісту, без порожнечі
          // зверху й знизу (скарга користувача, 2026-10-05).
          const h = phone || (n.w ?? 0) >= GRID_COLUMNS ? Math.ceil((px + GAP_PX) / cell) : standardRows(px, GAP_PX, cell);
          // Картка ще показує скелет (дані вантажаться, коли вона наближається до екрана), а висоту
          // вже має — збережену, з готовим вмістом. Скелет не дає їй стиснутись: інакше після F5 вона
          // стискалась би до S, сітка переставлялась, а з даними — росла й переставлялась знову.
          if (!phone && h < (n.h ?? 1) && n.el.querySelector(".sk-lines")) continue;
          if (n.h !== h) grid.update(n.el, { h });
        }
        // Перетин (не мав би бути) — ущільнити зі збереженням порядку. Діра
        // (вільне місце, під яким ще картки: звузили картку, змінили S↔L) —
        // ущільнити із заповненням дір: наступні картки займають вільне
        // місце. Діра, яку жодна картка не закриває (ширини в ряду не дають
        // 12), — розтягнути сусідню (holeFillSteps), по кроку за раз.
        const sRows = standardRows(0, GAP_PX, cell);
        for (let i = 0; i < 2 * nodes.length; i++) {
          if (grid.engine.nodes.some((n) => grid.engine.collide(n))) grid.compact("list");
          if (hasHoles(gridBoxes(grid), grid.getColumn())) grid.compact("compact");
          if (phone) break;
          const steps = holeFillSteps(gridBoxes(grid), grid.getColumn(), sRows, minCardW);
          if (steps.length === 0) break;
          for (const { id, ...change } of steps) {
            const target = grid.engine.nodes.find((n) => n.id === id)?.el;
            if (target) grid.update(target, change);
          }
        }
      } finally {
        fitting = false;
      }
    };
    fitCardsRef.current = fitCards;
    // Зміна ширини/колонок (onResize сітки) і зміна вмісту будь-якої картки.
    grid.on("resizecontent", () => fitCards());
    const cardObserver = new ResizeObserver(() => fitCards());
    cardObserverRef.current = cardObserver;
    observeCards(el, cardObserver);
    return () => {
      cancelAnimationFrame(revealRaf);
      clearTimeout(settle);
      window.removeEventListener("resize", markTransition);
      clearTimeout(deferred);
      observer.disconnect();
      cardObserver.disconnect();
      cardObserverRef.current = null;
      fitCardsRef.current = null;
      grid.destroy(false);
      gridRef.current = null;
      el.classList.remove("is-ready");
      setGridReady(false);
    };
  }, [hasData, storedGrid, gridEpoch, chartsRef, setGridEpoch, setGridReady, setStoredGrid]);

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
    //  • увімкнену ставимо на перше вільне місце (autoPosition). Раніше —
    //    строго в низ: тоді в розкладці бували діри, і autoPosition
    //    засовував картку в першу ж діру згори. Тепер дір немає (fitCards),
    //    тож перше вільне місце — кінець дашборда, а кілька щойно увімкнених
    //    ½ стають парами поруч, а не кожна окремою смугою на всю ширину.
    // Повторний показ вкладки (Next тримає попередні сторінки в Activity і заново
    // запускає ефекти): набір карток той самий, перепакування від власних ширин —
    // зайва робота на ~секунду з десятками перерахунків. Пересоздана сітка вже підхопила
    // DOM і розкладку у своєму ефекті вище.
    const sig = `${visibleKey}#${orderKey}`;
    if (visibleSigRef.current === sig) return;
    const first = visibleSigRef.current === null;
    visibleSigRef.current = sig;
    const domById = new Map([...el.querySelectorAll<GridItemHTMLElement>(":scope > .grid-stack-item")].map((i) => [i.getAttribute("gs-id"), i]));
    grid.batchUpdate();
    for (const node of [...grid.engine.nodes]) {
      if (node.el && !domById.has(node.el.getAttribute("gs-id"))) grid.removeWidget(node.el, false, false);
    }
    for (const item of domById.values()) {
      if (item.gridstackNode) continue;
      // Опції makeWidget ЗАМІНЮЮТЬ gs-* атрибути, а не доповнюють: без id
      // увімкнена картка жила в сітці як «undefined» — позиція не
      // зберігалась, мінімальна ширина й висоти S/L її не впізнавали, і такі
      // картки ставали стовпчиком зліва з порожньою правою половиною (живий
      // тест 2026-10-04).
      const id = item.getAttribute("gs-id") ?? "";
      grid.makeWidget(item, { id, w: Number(item.getAttribute("gs-w")) || 6, minW: minCardW(id), autoPosition: true });
    }
    grid.batchUpdate(false);
    observeCards(el, cardObserverRef.current);
    // Увімкнули чи вимкнули картку — перепакувати від власних ширин. Але не
    // на першому запуску (монтування): збережена розкладка вже узгоджена, а
    // перепакування з нуля могло дати інший порядок — після F5 картки
    // «з'їжджали» (живий тест 2026-10-04).
    fitCardsRef.current?.({ resetWidths: !first });
  }, [visibleKey, orderKey, chartsRef]);

  // Поля карток змінились ползунком щільності — висоти під вміст перемірюємо (спостерігач стежить лише за дітьми).
  useEffect(() => {
    fitCardsRef.current?.();
  }, [density]);

  // Вміст карток перемальовується з даними (скелетон → список, порожній
  // стан → діаграма) — нові дочірні блоки теж мають бути під наглядом.
  useEffect(() => {
    observeCards(chartsRef.current, cardObserverRef.current);
  });

  // Режим перетягування ↔ static-сітка. Поза режимом картки не тягнуться
  // і ручок немає — як і було з власним движком.
  useEffect(() => {
    gridRef.current?.setStatic(!editMode);
  }, [editMode, gridEpoch, hasData]);
}
