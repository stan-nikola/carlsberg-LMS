"use client";

import { useMemo, useState } from "react";
import { QuestionIcon, ChevronIcon, CheckIcon, XIcon, GripIcon } from "@/components/icons";
import { ScreenMedia } from "@/components/ScreenComponents";
import { shuffleArray } from "@/lib/coursePlayerLogic";
import { renderRichMarks } from "@/lib/richText";
import { useDragReorder } from "@/lib/useDragReorder";

type Img = { url: string; caption?: string };
type QuestionProps = {
  component: { title?: string | null; content?: Record<string, unknown> };
  screenNumber?: number;
  /** undefined — ще не відповідали; true/false — результат. */
  answer?: boolean;
  onAnswer: (correct: boolean) => void;
  onZoomImage?: (img: { src: string; alt: string }) => void;
  questionNumber?: number;
  questionTotal?: number;
};
type OrderItem = { text?: string };
type MatchPair = { left?: string; right?: string };

/**
 * Питання, де відповідь — не вибір із варіантів (2026-09-17).
 *
 * Обидва типи оцінювані й дають, як і quiz, ОДИН булевий результат:
 * правильно все або нічого. Часткового балу тут свідомо немає — рішення
 * користувача; уся система підрахунку (CoursePlayer scoreForSegment)
 * рахує кількість відповідей true, і частковий бал зачепив би її всю.
 *
 * Обидва зроблені БЕЗ перетягування: застосунок телефонний, а drag на
 * дотику промахується, особливо в рукавичках на складі. Порядок кроків
 * рухається стрілками, пари зіставляються двома тапами. Це рекомендація
 * і для drag-and-drop у гайдах: зони мають бути великі й очевидні — а
 * найбільша «зона» на телефоні це кнопка.
 */

/** Спільна шапка питання — той самий банер, що в QuizScreen. */
function QuestionHeader({
  screenNumber,
  questionNumber,
  questionTotal,
  actionLabel,
  title,
  images,
  onZoomImage,
  lead,
}: {
  screenNumber?: number;
  questionNumber?: number;
  questionTotal?: number;
  /** Що саме треба зробити — другим рядком у банері. */
  actionLabel: string;
  title?: string | null;
  images?: Img[];
  onZoomImage?: (img: { src: string; alt: string }) => void;
  lead?: string;
}) {
  return (
    <>
      <div className="cp-kicker">
        <span className="cp-kicker-num">{screenNumber}</span>
        <span>Питання</span>
      </div>
      <div className="quiz-banner">
        <span className="quiz-banner-ico" aria-hidden="true">
          <QuestionIcon />
        </span>
        {/* Тип завдання — у САМОМУ банері, а не окремою зеленою плашкою
            під ним (її прибрано, як раніше прибрали у звичайного питання):
            дві плашки поспіль забирали висоту й повторювали одна одну, а
            головне — «Порядок кроків» називав тип, але не казав, що з ним
            робити. Тепер тут інструкція: «розташуйте у правильній
            послідовності». */}
        <span className="quiz-banner-txt">
          <b>Блок питань</b>
          <span>
            {questionNumber && questionTotal ? `Питання ${questionNumber} з ${questionTotal} · ` : ""}
            {actionLabel}
          </span>
        </span>
      </div>
      {title && <h2 className="cp-h2">{renderRichMarks(title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}
      <ScreenMedia images={images} title={title} onZoomImage={onZoomImage} />
    </>
  );
}

/**
 * «Порядок кроків»: правильна послідовність — та, у якій кроки стоять у
 * конструкторі. Плеєр показує їх перемішаними; людина піднімає й опускає
 * рядки, поки не збере потрібний порядок, і натискає «Перевірити».
 */
export function OrderingScreen({ component, screenNumber, answer, onAnswer, onZoomImage, questionNumber, questionTotal }: QuestionProps) {
  const c = (component.content || {}) as { items?: OrderItem[]; lead?: string; images?: Img[]; explanation?: string };
  const items = c.items || [];
  const { lead, images, explanation } = c;
  // Перемішуємо один раз при монтуванні — інакше порядок стрибав би на
  // кожен рух (а рухи тут і є суттю завдання).
  const [order, setOrder] = useState(() => {
    const idx = items.map((_: OrderItem, i: number) => i);
    // Гарантія, що перемішане НЕ збігається з правильним: інакше в
    // завданні з двох кроків людина в половині випадків «вже склала».
    const shuffled = shuffleArray(idx);
    if (idx.length > 1 && shuffled.every((v, i) => v === idx[i])) return [...shuffled].reverse();
    return shuffled;
  });
  const isAnswered = answer !== undefined;

  // Перетягування — lib/useDragReorder.ts: та сама механіка, що й у
  // конструкторі (components/AdminCourseEditor.jsx OrderingFields), тут
  // застосована до масиву ПОЗИЦІЙ (order), а не самих кроків: крок №2
  // лишається кроком №2, міняється лише МІСЦЕ, на якому він стоїть.
  const { containerRef, containerProps, registerRow, dragId, dragDeltaY, moveByKeyboard } = useDragReorder({
    ids: order,
    onReorder: setOrder,
    disabled: isAnswered,
  });

  function check() {
    if (isAnswered) return;
    onAnswer(order.every((v, i) => v === i));
  }

  return (
    <>
      <QuestionHeader
        screenNumber={screenNumber}
        questionNumber={questionNumber}
        questionTotal={questionTotal}
        actionLabel="перетягніть блоки у правильній послідовності"
        title={component.title}
        lead={lead}
        images={images}
        onZoomImage={onZoomImage}
      />

      <ol className="q-order" ref={containerRef as React.RefObject<HTMLOListElement>} {...containerProps}>
        {order.map((itemIndex, pos) => {
          const correctHere = isAnswered && itemIndex === pos;
          const isDragging = dragId === itemIndex;
          return (
            <li
              key={itemIndex}
              ref={registerRow(itemIndex)}
              data-drag-row
              className={`q-order-row${isAnswered ? (correctHere ? " is-correct" : " is-wrong") : ""}${isDragging ? " is-dragging" : ""}`}
              style={isDragging ? { transform: `translateY(${dragDeltaY}px)` } : undefined}
            >
              <span className="q-order-num">{pos + 1}</span>
              <span className="q-order-text">{renderRichMarks(items[itemIndex]?.text)}</span>
              {!isAnswered && (
                <button
                  type="button"
                  className="q-order-handle"
                  data-drag-handle
                  aria-label={`Перетягніть, щоб змінити місце кроку «${items[itemIndex]?.text || pos + 1}» — або керуйте стрілками вгору/вниз`}
                  // Клавіатурна альтернатива драгу (WCAG «dragging movements»):
                  // фокус на ручці, стрілки рухають крок без жодного жесту.
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      moveByKeyboard(itemIndex, -1);
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      moveByKeyboard(itemIndex, 1);
                    }
                  }}
                >
                  <GripIcon />
                </button>
              )}
              {isAnswered && (
                <span className="q-order-mark" aria-hidden="true">
                  {correctHere ? <CheckIcon /> : <XIcon />}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {!isAnswered && (
        <button type="button" className="btn-primary-full q-order-check" onClick={check}>
          <span className="btn-label">Перевірити</span>
        </button>
      )}

      {isAnswered && (
        <div className={`q-fb show ${answer ? "ok" : "bad"}`}>
          <b className="q-fb-verdict">{answer ? "Правильно! Порядок вірний." : "Порядок неправильний."}</b>
          {!answer && (
            <span className="q-fb-explain">
              Правильна послідовність: {items.map((it) => it.text).filter(Boolean).join(" → ")}
            </span>
          )}
          {explanation && <span className="q-fb-explain">{renderRichMarks(explanation)}</span>}
        </div>
      )}
    </>
  );
}

/**
 * «Відповідність»: ліва колонка стоїть на місці, права перемішана.
 * Людина тапає по лівому елементу, потім по правому — пара зафіксована.
 * Повторний тап по лівому знімає його пару.
 */
export function MatchingScreen({ component, screenNumber, answer, onAnswer, onZoomImage, questionNumber, questionTotal }: QuestionProps) {
  const c = (component.content || {}) as { pairs?: MatchPair[]; lead?: string; images?: Img[]; explanation?: string };
  // useMemo, а не просто `c.pairs || []`: новий порожній масив на кожен
  // рендер міняв би залежність useMemo нижче, і права колонка
  // перемішувалась би заново при кожному тапі.
  const pairs = useMemo(() => c.pairs || [], [c.pairs]);
  const { lead, images, explanation } = c;
  const rightOrder = useMemo(() => {
    const idx = pairs.map((_: MatchPair, i: number) => i);
    const shuffled = shuffleArray(idx);
    if (idx.length > 1 && shuffled.every((v, i) => v === idx[i])) return [...shuffled].reverse();
    return shuffled;
  }, [pairs]);
  // { [leftIndex]: rightIndex }
  const [links, setLinks] = useState<Record<number, number>>({});
  const [activeLeft, setActiveLeft] = useState<number | null>(null);
  const isAnswered = answer !== undefined;

  function pickLeft(i: number) {
    if (isAnswered) return;
    if (links[i] !== undefined) {
      // Тап по вже зіставленому рядку знімає пару — інакше помилку
      // неможливо виправити, не почавши все спочатку.
      setLinks((prev) => {
        const next = { ...prev };
        delete next[i];
        return next;
      });
      setActiveLeft(i);
      return;
    }
    setActiveLeft(activeLeft === i ? null : i);
  }

  function pickRight(rightIndex: number) {
    if (isAnswered || activeLeft === null) return;
    setLinks((prev) => {
      const next = { ...prev };
      // Праву частину не можна віддати двом лівим одразу.
      for (const key of Object.keys(next)) if (next[Number(key)] === rightIndex) delete next[Number(key)];
      next[activeLeft] = rightIndex;
      return next;
    });
    setActiveLeft(null);
  }

  const allLinked = Object.keys(links).length === pairs.length;

  function check() {
    if (isAnswered) return;
    onAnswer(pairs.every((_, i) => links[i] === i));
  }

  /** Який номер пари показати біля елемента — щоб зв'язок було видно без ліній. */
  function badgeFor(leftIndex: number) {
    return links[leftIndex] === undefined ? null : Object.keys(links).indexOf(String(leftIndex)) + 1;
  }

  return (
    <>
      <QuestionHeader
        screenNumber={screenNumber}
        questionNumber={questionNumber}
        questionTotal={questionTotal}
        actionLabel="зіставте пари"
        title={component.title}
        lead={lead}
        images={images}
        onZoomImage={onZoomImage}
      />

      {/* Перша підказка пояснює МЕХАНІКУ цілком, а не лише поточний крок:
          «Оберіть пункт ліворуч» саме по собі не казало, що буде далі й
          навіщо (прохання користувача 2026-09-23). Далі підказка веде по
          кроках, як і раніше. Стоїть просто над колонками — там, куди
          дивиться рука, а не в банері нагорі. */}
      <p className="q-match-hint">
        {isAnswered
          ? "Ваші пари"
          : activeLeft === null
            ? "Натисніть пункт ліворуч, потім відповідний йому праворуч"
            : "Тепер оберіть пару праворуч"}
      </p>

      <div className="q-match">
        <ul className="q-match-col">
          {pairs.map((p, i) => {
            const linked = links[i] !== undefined;
            const correct = isAnswered && links[i] === i;
            return (
              <li key={i}>
                <button
                  type="button"
                  className={`q-match-item${activeLeft === i ? " is-active" : ""}${linked ? " is-linked" : ""}${
                    isAnswered ? (correct ? " is-correct" : " is-wrong") : ""
                  }`}
                  onClick={() => pickLeft(i)}
                  disabled={isAnswered}
                >
                  <span>{renderRichMarks(p.left)}</span>
                  {linked && <b className="q-match-badge">{badgeFor(i)}</b>}
                </button>
              </li>
            );
          })}
        </ul>
        <ul className="q-match-col">
          {rightOrder.map((rightIndex) => {
            const ownerLeft = Object.keys(links).find((k) => links[Number(k)] === rightIndex);
            const linked = ownerLeft !== undefined;
            return (
              <li key={rightIndex}>
                <button
                  type="button"
                  className={`q-match-item${linked ? " is-linked" : ""}`}
                  onClick={() => pickRight(rightIndex)}
                  disabled={isAnswered || activeLeft === null}
                >
                  <span>{renderRichMarks(pairs[rightIndex]?.right)}</span>
                  {linked && <b className="q-match-badge">{badgeFor(Number(ownerLeft))}</b>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {!isAnswered && (
        <button type="button" className="btn-primary-full" onClick={check} disabled={!allLinked}>
          <span className="btn-label">{allLinked ? "Перевірити" : "Зіставте всі пари"}</span>
        </button>
      )}

      {isAnswered && (
        <div className={`q-fb show ${answer ? "ok" : "bad"}`}>
          <b className="q-fb-verdict">{answer ? "Правильно! Усі пари вірні." : "Не всі пари вірні."}</b>
          {!answer && (
            <ul className="q-fb-options">
              {pairs.map((p, i) => (
                <li key={i} className={links[i] === i ? "is-correct" : "is-wrong"}>
                  <b>{renderRichMarks(p.left)}</b>
                  <span>{renderRichMarks(p.right)}</span>
                </li>
              ))}
            </ul>
          )}
          {explanation && <span className="q-fb-explain">{renderRichMarks(explanation)}</span>}
        </div>
      )}
    </>
  );
}
