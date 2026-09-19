"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon, LockIcon, ClockIcon, CalendarIcon, CertificateIcon, PlayIcon, AlertIcon, XIcon } from "@/components/icons";
import { MorphRevealIcon } from "@/components/MorphRevealIcon";
import type { CoursePlanView, PlanModuleStatus } from "@/lib/coursePlan";
import { buildProgressPath, buildSnakePath, type SnakePoint } from "@/lib/snakePath";

/**
 * План курсу — перше, що людина бачить, відкривши курс: склад курсу,
 * що вже складено, з якого модуля піде навчання, коли відкриється
 * закритий модуль, до якої дати рекомендовано скласти кожен і скільки
 * часу на це закласти.
 *
 * Показ (2026-09-17, ШОСТА ітерація — фідбек після живого користування
 * п'ятою):
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
 *   через " · ", переноситься по ширині картки). Попередня (п'ята)
 *   ітерація ховала повний набір за ховером на десктопі — але користувач
 *   попросив прибрати цей патерн зовсім, скрізь: на телефоні ховера й
 *   так немає фізично, а мати різний обсяг інформації залежно від
 *   пристрою — гірше, ніж просто завжди показувати все.
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

const STATUS_ICON: Record<PlanModuleStatus, React.ReactNode> = {
  // Морф-анімація появи (MorphRevealIcon, запит користувача, 2026-09-19) —
  // єдиний вузол дороги, для якого це має сенс: "складено" — кінцевий,
  // радісний стан, решта (available/locked/failed) статичні за задумом.
  passed: <MorphRevealIcon shape="check" label="Складено" size={14} />,
  failed: <AlertIcon />,
  available: <PlayIcon />,
  locked: <LockIcon />,
};

/** Радіус заокруглення кутів дороги на переносі рядка — px. */
const ROAD_CORNER_RADIUS = 14;

/** Тривалість протяжки зеленого шляху — МАЄ збігатись із
 *  `--road-draw-duration` у app/styles/course-player.css (0.9s база × 1.2
 *  = 1.08s, "на 20% довше"). Звідси ж рахується затримка сплеску
 *  масштабу на кожному пройденому вузлі, щоб вона встигала за лінією. */
const ROAD_DRAW_MS = 1080;

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
  const dotRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [path, setPath] = useState<{ base: string; progress: string }>({ base: "", progress: "" });
  const [mounted, setMounted] = useState(false);

  const stopIndex = plan.nextModuleId
    ? plan.modules.findIndex((m) => m.id === plan.nextModuleId)
    : plan.modules.length - 1;

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
      const points: SnakePoint[] = [];
      for (let i = 0; i < cellRefs.current.length; i += 1) {
        const cell = cellRefs.current[i];
        const dot = dotRefs.current[i];
        if (!cell || !dot) return; // ще не всі комірки змонтовано — пропускаємо цей вимір
        const cellRect = cell.getBoundingClientRect();
        const dotRect = dot.getBoundingClientRect();
        points.push({
          x: dotRect.left + dotRect.width / 2 - containerRect.left,
          y: dotRect.top + dotRect.height / 2 - containerRect.top,
          rowBottom: cellRect.bottom - containerRect.top,
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
    return () => ro.disconnect();
  }, [plan.modules.length, stopIndex]);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="cp-plan">
      {!preview && (
        <ul className="cp-plan-facts">
          {plan.assignedAtLabel && (
            <li>
              <CalendarIcon />
              <span>
                <b>{plan.assignedAtLabel}</b>
                Призначено
              </span>
            </li>
          )}
          {plan.dueDateLabel && (
            <li className={plan.overdue ? "is-overdue" : undefined}>
              <CalendarIcon />
              <span>
                <b>{plan.dueDateLabel}</b>
                Дедлайн
              </span>
            </li>
          )}
          <li>
            <CheckIcon />
            <span>
              <b>
                {plan.passedCount} з {plan.moduleCount}
              </b>
              Складено модулів
            </span>
          </li>
          {plan.remainingCount === 0 && (
            <li>
              <ClockIcon />
              <span>
                <b>{plan.totalTimeLabel}</b>
                Весь курс
              </span>
            </li>
          )}
          {plan.certificateLabel && (
            <li className={plan.certificateEarned ? "is-earned" : undefined}>
              <CertificateIcon />
              <span>
                <b>{plan.certificateLabel}</b>
                Сертифікат
              </span>
            </li>
          )}
        </ul>
      )}

      {plan.scheduleLabel && (
        <p className={`cp-plan-pace is-${plan.scheduleStatus}`}>{plan.scheduleLabel}</p>
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
            // зупиняє сам SVG-шлях (buildProgressPath). Сплеск масштабу
            // на такому вузлі запізнюється пропорційно його місцю в
            // послідовності, щоб відчувалось як рух ЗА лінією, а не
            // одночасний спалах усього.
            const isReached = stopIndex >= 0 && i <= stopIndex;
            const popStyle = isReached
              ? ({ animationDelay: `${(ROAD_DRAW_MS * i) / Math.max(stopIndex, 1)}ms` } as React.CSSProperties)
              : undefined;

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
                className={["cp-plan-cell", `is-${m.status}`, m.isNext ? "is-next" : "", isReached ? "is-reached" : ""]
                  .filter(Boolean)
                  .join(" ")}
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
                  {STATUS_ICON[m.status]}
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
