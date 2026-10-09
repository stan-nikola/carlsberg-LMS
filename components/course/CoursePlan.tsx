"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon, LockIcon, ClockIcon, PlayIcon, AlertIcon, XIcon } from "@/components/ui/icons";
import { MorphRevealIcon } from "@/components/ui/MorphRevealIcon";
import { pickPlanFocusModuleId, type CoursePlanView, type PlanModuleStatus } from "@/lib/coursePlan";
import { buildProgressPath, buildSnakePath, type SnakePoint } from "@/lib/snakePath";
import { isFullyInView, smoothScrollElementIntoView } from "@/lib/smoothScrollTo";
import { cubicBezierTimeAtProgress } from "@/lib/cubicBezier";
import { useSeenValue } from "@/hooks/useSeenValue";
import { prefersReducedMotion } from "@/lib/motion";
import { isClass } from "@/lib/cssClass";

/**
 * План курсу — перше, що людина бачить, відкривши курс: склад курсу,
 * що вже складено, з якого модуля піде навчання, коли відкриється
 * закритий модуль, до якої дати рекомендовано скласти кожен і скільки
 * часу на це закласти.
 *
 * Показ:
 * - **Один і той самий "флагшток" в обох режимах** — маленька крапка на
 *   лінії, коротка ніжка, великий кольоровий кружечок статусу наполовину
 *   на картці. Різниться лише ВІСЬ: на десктопі (`@container cp-card`,
 *   min-width:640px) флагшток стирчить ЗГОРИ картки (крапка над,
 *   кружечок наполовину на верхній грані), на мобільному — ДЗЕРКАЛЬНО
 *   зліва (крапка на вертикальній рейці зліва, кружечок наполовину на
 *   лівій грані картки). Позиції — чисті числа в CSS
 *   (.cp-plan-dot/-stem/-badge), JS їх не знає: вимірює РЕАЛЬНИЙ
 *   `getBoundingClientRect()` самого `.cp-plan-dot` (він один існує в
 *   обох режимах, CSS лише переставляє його).
 * - **Картки на десктопі — в ряд ЗА КОНТЕНТОМ** (`flex-wrap`, не жорсткі
 *   CSS grid-колонки) і ЦЕНТРОВАНІ в контейнері (`justify-content:
 *   center`) незалежно від того, скільки влізло в ряд. Картки одного
 *   ряду — ОДНАКОВОЇ висоти (дефолтний flex `align-items:stretch` по
 *   рядку, а не `flex-start`) — по найвищій у цьому ряду, сама висота й
 *   далі за контентом.
 * - **Колірна схема — "світлофор без червоного"**: пройдено — зелений,
 *   доступно/наступний — синій (бренд-акцент), провалено/потрібен
 *   повтор — бурштиновий `--cb-alert` (не червоний: ~8% чоловіків не
 *   відрізняють червоний від зеленого, і червоний семантично читається
 *   як "стоп, назавжди", що хибно для стану "спробуй ще раз"), закрито —
 *   нейтральний сірий.
 * - **Усі дані модуля — ПРЯМО на картці, тултипа по ховеру більше нема
 *   ВЗАГАЛІ** (`moduleFacts` нижче: час, бал, дата складання, причина
 *   блокування, пауза перепроходження, рекомендована дата — одним рядком
 *   через " · ", переноситься по ширині картки). Рішення користувача: на
 *   телефоні ховера немає, а різний обсяг інформації залежно від пристрою
 *   гірший, ніж завжди показувати все.
 * - **Анімація заливки на 20% довша** (`ROAD_DRAW_MS` нижче, синхронно з
 *   `--road-draw-duration` у CSS — тримати разом) і супроводжується
 *   легким сплеском масштабу (`is-reached`/`animationDelay`) на кожному
 *   вже пройденому вузлі та картці — не одночасно на всіх, а з
 *   наростаючою затримкою по індексу, щоб відчувалось як рух ЗА лінією,
 *   що малюється, а не як миготіння відразу всього.
 *
 * Чому шлях рахує JS, а не чистий CSS: кількість карток у рядку залежить
 * від ширини екрана й наперед невідома, тож координати поворотів можна
 * взяти лише з РЕАЛЬНОЇ верстки після рендеру (ResizeObserver). Перехід
 * рядка (лише в десктопному режимі — на мобільному одна колонка, dx=0,
 * і lib/snakePath.ts сам дає пряму лінію без переносів) рахується від
 * СПРАВЖНЬОГО вільного проміжку (найнижча картка ряду → крапка
 * наступного, `rowBottom` у lib/snakePath.ts, максимум по всьому ряду —
 * картки в ряду за контентом можуть мати різну висоту до вирівнювання).
 *
 * `pathLength={1}` на SVG `<path>` нормалізує довжину під 1 незалежно
 * від реальних пікселів, тож `stroke-dasharray:1; stroke-dashoffset:1→0`
 * малює лінію "з нуля" без жодної математики довжини в JS. mounted-
 * прийом — той самий, що в CompletionRing.tsx.
 */

// passed рендериться окремо (нижче, inline) — йому потрібна ЖИВА затримка
// на вузол (staggerMs), а не статичний елемент один на всі картки.
const STATUS_ICON: Partial<Record<PlanModuleStatus, React.ReactNode>> = {
  failed: <AlertIcon />,
  available: <PlayIcon />,
  locked: <LockIcon />,
};

/** Радіус заокруглення кутів дороги на переносі рядка — px. */
const ROAD_CORNER_RADIUS = 14;

/** Тривалість протяжки зеленого шляху — МАЄ збігатись із transition на
 *  `.cp-plan-road-progress.is-mounted` в app/styles/course-player.css.
 *  1.08s × 3 = 3.24s (2026-09-22, рішення користувача: "в три раза
 *  медленнее" — і скрол, і сама лінія мають встигати читатись оком, не
 *  бути миттєвими). Звідси ж рахується затримка сплеску масштабу на
 *  кожному пройденому вузлі, щоб вона встигала за лінією, і тривалість
 *  синхронного скролу до потрібного модуля (lib/smoothScrollTo.ts). */
const ROAD_DRAW_MS = 3240;
/** Пауза перед автоскролом — встигнути прочитати назву курсу й шапку плану. */
const AUTOSCROLL_DELAY_MS = 1200;
/** Автоскрол лише коли пройдено стільки модулів — інакше поточний і так нагорі. */
const AUTOSCROLL_MIN_PASSED = 3;

/** МАЄ збігатись із --ease-premium (app/styles/tokens.css) — та сама
 *  крива, якою CSS анімує stroke-dashoffset лінії. Потрібна тут окремо
 *  (не лише в CSS), щоб порахувати РЕАЛЬНИЙ момент часу, коли лінія
 *  візуально доходить до вузла i (нижче, cubicBezierTimeAtProgress) —
 *  крива не лінійна (швидко на старті, гальмує в кінці), тож "вузол i з
 *  N" проходиться не в момент `i/N * ROAD_DRAW_MS`. */
const EASE_PREMIUM: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

type ModuleFact = { icon?: React.ReactNode; text: string; className?: string };

/**
 * Факти модуля — НЕ повний список усіх полів, а лише ті, що додають
 * НОВУ інформацію для поточного стану (2026-09-18, скарга користувача:
 * "після попереднього модуля" на закритій картці зайве — це й так видно
 * з замка й лінії; ціль/дата складання зайві там, де є конкретніший
 * факт). Іконку мають лише час (годинник) і бал — обидві SVG (2026-09-18:
 * кубок-емодзі прибрано — користувач попросив саме svg). Іконка бала —
 * CheckIcon за складання, XIcon за провал: форма йде за тим самим
 * "добре/погано", що й колір (is-good/is-bad, той самий клас на іконці й
 * тексті — іконка малюється `stroke="currentColor"`, тож підхоплює колір
 * автоматично). Решта фактів — простим текстом, інакше кожен рядок
 * перетворюється на ряд дрібних піктограм, який важче прочитати, ніж
 * просто слова.
 */
function moduleFacts(m: CoursePlanView["modules"][number]): ModuleFact[] {
  const facts: ModuleFact[] = [];

  if (m.status === "passed") {
    // Реальний час, не орієнтовний (timeLabel сам уже без "≈", коли є
    // actualMinutes — lib/coursePlan.ts). Бал — зеленим (складено, вище
    // прохідного порога за визначенням). Дата складання — сама собою,
    // без слова "складено". Рекомендована дата модуля ("до …") — ЛИШЕ
    // якщо бал не рівно 100%: є куди рости, і дата підказує, до коли
    // варто спробувати перескласти на ідеал; при 100% дотягувати нема
    // куди, підказка не потрібна.
    facts.push({ icon: <ClockIcon />, text: m.timeLabel });
    if (m.scoreLabel) facts.push({ icon: <CheckIcon />, text: m.scoreLabel, className: "is-good" });
    if (m.completedAtLabel) facts.push({ text: m.completedAtLabel });
    if (m.scorePercent !== 100 && m.targetLabel) facts.push({ text: m.targetLabel });
    // Покращити результат ще не можна (пауза перепроходження не минула,
    // actionLabel тому null) — без цього факту картка мовчала б про те,
    // що повторна спроба взагалі можлива, і коли саме.
    if (m.scorePercent !== 100 && !m.actionLabel && m.retakeLabel) facts.push({ text: m.retakeLabel });
    return facts;
  }

  if (m.status === "failed") {
    // Час витраченої невдалої спроби — не найважливіше зараз; важливо
    // ЩО вийшло (бал червоним — не дотягнув до прохідного) і ЧИ можна
    // вже спробувати ще раз.
    if (m.scoreLabel) facts.push({ icon: <XIcon />, text: m.scoreLabel, className: "is-bad" });
    if (m.retakeLabel) facts.push({ text: m.retakeLabel });
    return facts;
  }

  if (m.status === "locked") {
    facts.push({ icon: <ClockIcon />, text: m.timeLabel });
    // lockKind "sequence" ("Після попереднього модуля") — прибираємо:
    // замок-іконка на вузлі й сама лінія вже кажуть "чекайте на
    // попередній", текст нічого не додає. date/days лишаємо — там
    // РЕАЛЬНА нова інформація (конкретна дата чи число днів).
    if (m.lockLabel && m.lockKind !== "sequence") facts.push({ text: m.lockLabel });
    return facts;
  }

  // available/next — орієнтовний час + рекомендована дата ("до …", якщо
  // графік курсу заданий): 2026-09-18, скарга користувача — саме на
  // готовій до проходження картці дедлайну не було зовсім, хоча в усіх
  // інших станах, де він є (passed<100%, locked date/days), він
  // показується.
  facts.push({ icon: <ClockIcon />, text: m.timeLabel });
  if (m.targetLabel) facts.push({ text: m.targetLabel });
  return facts;
}

/** Статуси модулів по id — підпис плану для «модуль відкрився» (localStorage, hooks/useSeenValue.ts). */
function statusesById(plan: CoursePlanView): Record<string, string> {
  return Object.fromEntries(plan.modules.map((m) => [m.id, m.status]));
}
function parseStatuses(raw: string | null): Record<string, string> | null {
  try {
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}
/** Момент, коли замок у бейджі змінюється на «▶» — середина руху (0.6s затримки + половина з 0.8s). */
const UNLOCK_SWAP_MS = (0.6 + 0.8 * 0.5) * 1000;

export function CoursePlanPanel({
  plan,
  slug,
  /** Прев'ю в конструкторі: без посилань і без блоку фактів. */
  preview = false,
}: {
  plan: CoursePlanView;
  slug: string;
  preview?: boolean;
}) {
  const gridRef = useRef<HTMLOListElement>(null);
  const cellRefs = useRef<(HTMLLIElement | null)[]>([]);
  // «Модуль відкрився» (стенд Motion Tuner «D», 2026-10-04): модулі, що були
  // locked минулого візиту (localStorage по курсу), а тепер available — замок
  // стискається й зникає, «▶» зʼявляється. Поки триває перша половина руху,
  // в бейджі ще замок (lockPhase).
  const seenRaw = useSeenValue(preview ? null : `cp_plan_seen:${slug}`, JSON.stringify(statusesById(plan)));
  const unlockedIds = useMemo(() => {
    const seen = parseStatuses(seenRaw);
    return new Set(plan.modules.filter((m) => m.status === "available" && seen?.[m.id] === "locked").map((m) => m.id));
  }, [seenRaw, plan.modules]);
  const [lockPhase, setLockPhase] = useState(true);
  useEffect(() => {
    if (unlockedIds.size === 0) return undefined;
    const t = setTimeout(() => setLockPhase(false), UNLOCK_SWAP_MS);
    return () => clearTimeout(t);
  }, [unlockedIds]);
  const dotRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [path, setPath] = useState<{ base: string; progress: string }>({ base: "", progress: "" });
  const [mounted, setMounted] = useState(false);

  // focusModuleId — той самий модуль, куди й плавно скролить ефект нижче
  // (lib/coursePlan.ts pickPlanFocusModuleId, 2026-09-22): лінія прогресу
  // зупиняється РІВНО там, а не завжди на останньому модулі — інакше вона
  // "перестрибувала" б повз заблокований чи покращуваний модуль до кінця.
  const focusModuleId = pickPlanFocusModuleId(plan);
  const stopIndex =
    focusModuleId != null ? plan.modules.findIndex((m) => m.id === focusModuleId) : plan.modules.length - 1;

  // Вимірюємо позиції вузлів щоразу, як сітка реально змінює розмір —
  // кількість карток у ряду (десктоп, flex-wrap за контентом) чи сам
  // режим (лівий рейка ↔ флагшток на @container-порозі) залежить від
  // ширини екрана, тож перерахунок при resize обов'язковий.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    function measure() {
      const gridEl = gridRef.current;
      if (!gridEl) return;
      const containerRect = gridEl.getBoundingClientRect();
      if (!containerRect.width) return; // сітку ще не видно — нема що міряти
      // Картка курсу в'їжджає з анімацією масштабу: замір посеред неї стискав
      // усі координати (~2%), і лінія повертала вниз, не дійшовши до станцій
      // праворуч, а кінця анімації ResizeObserver не бачить (2026-10-09).
      // Ділимо на поточний масштаб — справжня ширина / видима.
      const k = gridEl.offsetWidth / containerRect.width;
      const points: SnakePoint[] = [];
      for (let i = 0; i < cellRefs.current.length; i += 1) {
        const cell = cellRefs.current[i];
        const dot = dotRefs.current[i];
        if (!cell || !dot) return; // ще не всі комірки змонтовано — пропускаємо цей вимір
        const cellRect = cell.getBoundingClientRect();
        const dotRect = dot.getBoundingClientRect();
        points.push({
          x: (dotRect.left + dotRect.width / 2 - containerRect.left) * k,
          y: (dotRect.top + dotRect.height / 2 - containerRect.top) * k,
          rowBottom: (cellRect.bottom - containerRect.top) * k,
        });
      }
      setPath({
        base: buildSnakePath(points, ROAD_CORNER_RADIUS),
        progress: buildProgressPath(points, stopIndex, ROAD_CORNER_RADIUS),
      });
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    // І кожну картку окремо: ширина однієї картки (підпис «Через N днів…»
    // переноситься, догрузився шрифт) міняє X її станції, а розмір сітки — ні;
    // без цього лінія повертала вниз, не дійшовши до вузла (2026-10-08).
    for (const cell of cellRefs.current) if (cell) ro.observe(cell);
    let alive = true;
    document.fonts?.ready.then(() => alive && measure());
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [plan.modules.length, stopIndex]);

  // Автоскрол до поточного модуля (2026-10-04, скарга користувача: одразу після
  // входу назва курсу й шапка «їхали» вгору раніше, ніж їх встигаєш прочитати).
  // Правила — звичні для автоскролу:
  //  - лише коли є куди: пройдено щонайменше AUTOSCROLL_MIN_PASSED модулів і
  //    потрібний модуль ще НЕ видно на екрані; інакше нічого не рухаємо;
  //  - спершу пауза AUTOSCROLL_DELAY_MS — людина читає назву й шапку;
  //  - людина сама торкнулась, погортала чи натиснула клавішу — скасовуємо (і до
  //    старту, і посеред анімації), не боремося з нею;
  //  - «зменшити рух» у системі — без автоскролу взагалі, а не різкий стрибок.
  // Заливка лінії стартує разом зі скролом і триває ту саму ROAD_DRAW_MS
  // (рішення 2026-09-22: «линия должна ползти вниз вместе со скроллом»); коли
  // скролу немає — лінія малюється одразу. Не в preview (конструктор): там
  // немає реального прогресу, який варто доганяти скролом.
  useLayoutEffect(() => {
    const passed = plan.modules.filter((m) => m.status === "passed").length;
    const cell = stopIndex >= 0 ? cellRefs.current[stopIndex] : null;
    const reduceMotion = prefersReducedMotion();
    const wantScroll = !preview && !reduceMotion && passed >= AUTOSCROLL_MIN_PASSED && cell != null && !isFullyInView(cell);
    if (!wantScroll) {
      const id = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id);
    }

    let userTookOver = false;
    const stop = () => {
      userTookOver = true;
    };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const e of events) window.addEventListener(e, stop, { passive: true });
    const timer = setTimeout(() => {
      setMounted(true);
      if (!userTookOver) smoothScrollElementIntoView(cell!, ROAD_DRAW_MS, 0.28, () => userTookOver);
    }, AUTOSCROLL_DELAY_MS);
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, stop);
    };
    // plan.modules — лише кількість пройдених; перезапуск при зміні плану не потрібен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopIndex, preview]);

  return (
    <div className="cp-plan">
      {/* Призначено/Дедлайн/Складено модулів прибрано з плашок (2026-09-22,
          запит користувача): дата призначення й дедлайн і так звучать у
          scheduleLabel/paceLabel нижче, а "N з M складено" дублює сам
          план — кожна картка внизу вже показує свій статус. Сертифікат
          переїхав у cp-note (CourseReview.jsx) — короткий текстовий
          рядок замість окремої картки. Плашка "Весь курс: N хв" (показ на
          повністю пройденому курсі) прибрана зовсім тим самим днем —
          другорядне число, яке нічого не додавало на екрані вже
          завершеного курсу. */}
      {plan.scheduleLabel && (
        <p className={`cp-plan-pace ${isClass(plan.scheduleStatus)}`}>{plan.scheduleLabel}</p>
      )}
      {plan.paceLabel && !plan.scheduleLabel && (
        <p className={`cp-plan-pace${plan.overdue ? " is-overdue" : ""}`}>{plan.paceLabel}</p>
      )}
      {plan.paceLabel && plan.scheduleLabel && plan.overdue && (
        <p className="cp-plan-pace is-overdue">{plan.paceLabel}</p>
      )}

      <div className="cp-plan-road-wrap">
        {/* Сам шлях — суто декоративний SVG-шар ПІД карткою, вимірюваний
            від .cp-plan-cell (див. useLayoutEffect вище). aria-hidden:
            прогрес курсу вже озвучено текстом у .cp-plan-facts і в кожній
            картці (aria-label нижче), лінія нічого не додає для читання
            з екрана. */}
        <svg className="cp-plan-road-svg" aria-hidden="true">
          {path.base && <path d={path.base} pathLength={1} className="cp-plan-road-base" />}
          {path.progress && (
            <path
              d={path.progress}
              pathLength={1}
              className={`cp-plan-road-progress${mounted ? " is-mounted" : ""}`}
            />
          )}
        </svg>

        <ol className={`cp-plan-grid${mounted ? " is-mounted" : ""}`} ref={gridRef}>
          {plan.modules.map((m, i) => {
            const facts = moduleFacts(m);
            const showAction = m.canPlay && !preview && m.actionLabel;
            // "Пройдений" зеленою лінією вузол — той самий stopIndex, що
            // зупиняє сам SVG-шлях (buildProgressPath). Сплеск масштабу на
            // такому вузлі спрацьовує РІВНО в момент, коли лінія візуально
            // заїжджає в його кружечок — не пропорційно індексу картки
            // (2026-09-22, рішення користувача): --ease-premium НЕ лінійна
            // (швидко на старті, гальмує в кінці), тож вузол i з N
            // насправді проходиться в інший момент часу, ніж
            // `i/N * ROAD_DRAW_MS`. cubicBezierTimeAtProgress рахує
            // РЕАЛЬНИЙ момент за тією самою кривою, плюс фіксоване
            // відставання 100ms — картка "наздоганяє" лінію з невеликим
            // запізненням, а не спалахує одночасно з нею. Та сама
            // staggerMs іде і в MorphRevealIcon (галочка "складено" нижче) —
            // щоб вона промальовувалась СИНХРОННО зі сплеском, картка за
            // карткою, а не вся одразу.
            const isReached = stopIndex >= 0 && i <= stopIndex;
            const lineDelayMs = isReached
              ? cubicBezierTimeAtProgress(...EASE_PREMIUM, i / Math.max(stopIndex, 1)) * ROAD_DRAW_MS
              : 0;
            const staggerMs = isReached ? lineDelayMs + 100 : 0;
            const popStyle = isReached ? ({ animationDelay: `${staggerMs}ms` } as React.CSSProperties) : undefined;
            // Цільовий вузол — саме той, де зупиняється лінія/скрол
            // (lib/coursePlan.ts pickPlanFocusModuleId): на відміну від
            // решти пройдених вузлів, його сплеск масштабу лишається
            // трохи збільшеним і ПІСЛЯ анімації (2026-09-22, рішення
            // користувача: "оставь этот апскейл, чтобы он был выделен
            // среди остальных") — .cp-plan-cell.is-target нижче в CSS.
            const isTarget = isReached && i === stopIndex;

            const cardBody = (
              <>
                <span className="cp-plan-square-title">{m.title}</span>
                {facts.length > 0 && (
                  <span className="cp-plan-square-facts">
                    {facts.map((f, fi) => (
                      <span key={fi} className={["cp-plan-fact", f.className].filter(Boolean).join(" ")}>
                        {f.icon}
                        {f.text}
                      </span>
                    ))}
                  </span>
                )}
                {showAction && <span className="cp-plan-square-action">{m.actionLabel}</span>}
              </>
            );

            return (
              <li
                key={m.id}
                ref={(el) => {
                  cellRefs.current[i] = el;
                }}
                className={[
                  "cp-plan-cell",
                  isClass(m.status),
                  m.isNext ? "is-next" : "",
                  isReached ? "is-reached" : "",
                  isTarget ? "is-target" : "",
                  unlockedIds.has(m.id) ? "is-unlocked" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ "--cp-i": i } as React.CSSProperties}
              >
                <span
                  className="cp-plan-dot"
                  aria-hidden="true"
                  ref={(el) => {
                    dotRefs.current[i] = el;
                  }}
                />
                <span className="cp-plan-stem" aria-hidden="true" />
                <span className="cp-plan-badge" aria-hidden="true" style={popStyle}>
                  {m.status === "passed" ? (
                    <MorphRevealIcon shape="check" label="Складено" size={14} delay={staggerMs} />
                  ) : lockPhase && unlockedIds.has(m.id) ? (
                    <LockIcon />
                  ) : (
                    STATUS_ICON[m.status]
                  )}
                </span>
                {m.canPlay && !preview ? (
                  <Link href={`/courses/${slug}?module=${m.id}`} className="cp-plan-square" style={popStyle}>
                    {cardBody}
                  </Link>
                ) : (
                  <div className="cp-plan-square is-static" style={popStyle}>
                    {cardBody}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
