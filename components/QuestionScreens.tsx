"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { QuestionIcon, ChevronIcon, CheckIcon, XIcon, GripIcon } from "@/components/icons";
import { ScreenMedia } from "@/components/ScreenComponents";
import { renderRichMarks } from "@/lib/richText";
import { useDragReorder } from "@/lib/useDragReorder";
import { answerFor, isAnswerDone, viewContent, type AnswerState } from "@/lib/grading";
import { AnswerStatus } from "@/components/AnswerStatus";
import { prefersReducedMotion } from "@/lib/motion";

type Img = { url: string; caption?: string };
type QuestionProps = {
  component: { id: number | string; title?: string | null; content?: Record<string, unknown> };
  screenNumber?: number;
  /** lib/grading.ts AnswerState: undefined — ще не відповідали. */
  answer?: AnswerState;
  onAnswer: (answer: AnswerState) => void;
  onZoomImage?: (img: { src: string; alt: string }) => void;
  questionNumber?: number;
  questionTotal?: number;
};
type Keyed = { key: string; text: string };
type RevealPair = { leftKey: string; rightKey: string; left: string; right: string };

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
  // Кроки вже перемішані (lib/grading.ts publicContent: гарантовано НЕ в
  // правильному порядку — інакше в завданні з двох кроків людина в половині
  // випадків «вже склала») і під непрозорими key: правильний порядок у
  // браузер не потрапляє, його повертає сервер у розборі після відповіді.
  const view = useMemo(() => viewContent("ordering", component.content, component.id), [component.content, component.id]);
  const items = useMemo(() => (view.items || []) as Keyed[], [view]);
  const itemByKey = useMemo(() => new Map(items.map((it) => [it.key, it])), [items]);
  const { lead, images } = view as { lead?: string; images?: Img[] };
  const checking = answer?.status === "checking";
  const graded = typeof answer?.correct === "boolean";
  const isAnswered = checking || isAnswerDone(answer);
  const [draft, setDraft] = useState<string[]>(() => items.map((it) => it.key));
  const answeredOrder = (answer?.response as { order?: string[] } | undefined)?.order;
  const order = isAnswered && Array.isArray(answeredOrder) ? answeredOrder : draft;
  const reveal = graded ? (answer!.reveal as { items?: Keyed[]; explanation?: string } | null) : null;
  const correctOrder = reveal?.items || [];
  const explanation = reveal?.explanation;

  // Перетягування — lib/useDragReorder.ts: та сама механіка, що й у
  // конструкторі (components/course-editor/fields/questions.tsx OrderingFields).
  const { containerRef, containerProps, registerRow, dragId, dragDeltaY, moveByKeyboard } = useDragReorder<string>({
    ids: order,
    onReorder: setDraft,
    disabled: isAnswered,
  });

  function check() {
    if (isAnswered) return;
    onAnswer(answerFor("ordering", component.content, { order: draft }));
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

      <ol className="q-order" ref={containerRef} {...containerProps}>
        {order.map((key, pos) => {
          // Позначки по рядках — лише коли сервер віддав правильний порядок
          // (тобто відповідь правильна): після помилки він його не розкриває.
          const marked = graded && correctOrder.length > 0;
          const correctHere = marked && correctOrder[pos]?.key === key;
          const isDragging = dragId === key;
          const text = itemByKey.get(key)?.text;
          return (
            <li
              key={key}
              ref={registerRow(key)}
              data-drag-row
              className={`q-order-row${marked ? (correctHere ? " is-correct" : " is-wrong") : ""}${isDragging ? " is-dragging" : ""}`}
              style={isDragging ? { transform: `translateY(${dragDeltaY}px)` } : undefined}
            >
              <span className="q-order-num">{pos + 1}</span>
              <span className="q-order-text">{renderRichMarks(text)}</span>
              {!isAnswered && (
                <button
                  type="button"
                  className="q-order-handle"
                  data-drag-handle
                  aria-label={`Перетягніть, щоб змінити місце кроку «${text || pos + 1}» — або керуйте стрілками вгору/вниз`}
                  // Клавіатурна альтернатива драгу (WCAG «dragging movements»):
                  // фокус на ручці, стрілки рухають крок без жодного жесту.
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      moveByKeyboard(key, -1);
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      moveByKeyboard(key, 1);
                    }
                  }}
                >
                  <GripIcon />
                </button>
              )}
              {marked && (
                <span className="q-order-mark" aria-hidden="true">
                  {correctHere ? <CheckIcon /> : <XIcon />}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {(!isAnswered || checking) && (
        <button
          type="button"
          className={`btn-primary-full q-order-check${checking ? " is-checking" : ""}`}
          onClick={check}
          aria-busy={checking}
        >
          <span className="btn-label">Перевірити</span>
        </button>
      )}

      <AnswerStatus answer={answer} />

      {graded && (
        <div className={`q-fb show ${answer!.correct ? "ok" : "bad"}`}>
          <b className="q-fb-verdict">{answer!.correct ? "Правильно! Порядок вірний." : "Порядок неправильний."}</b>
          {!answer!.correct && correctOrder.length > 0 && (
            <span className="q-fb-explain">
              Правильна послідовність: {correctOrder.map((it) => it.text).filter(Boolean).join(" → ")}
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
  // Ліва колонка — як у конструкторі, права — вже перемішана й під
  // непрозорими key (lib/grading.ts publicContent): які пари правильні,
  // браузер дізнається лише з розбору після відповіді.
  const view = useMemo(() => viewContent("matching", component.content, component.id), [component.content, component.id]);
  const lefts = (view.lefts || []) as Keyed[];
  const rights = (view.rights || []) as Keyed[];
  const { lead, images } = view as { lead?: string; images?: Img[] };
  const checking = answer?.status === "checking";
  const graded = typeof answer?.correct === "boolean";
  const isAnswered = checking || isAnswerDone(answer);
  // { [leftKey]: rightKey }
  const [draft, setDraft] = useState<Record<string, string>>({});
  const answeredLinks = (answer?.response as { links?: Record<string, string> } | undefined)?.links;
  const links = isAnswered && answeredLinks ? answeredLinks : draft;
  const [activeLeft, setActiveLeft] = useState<string | null>(null);
  const reveal = graded ? (answer!.reveal as { pairs?: RevealPair[]; explanation?: string } | null) : null;
  const revealPairs = reveal?.pairs || [];
  const correctRightOf = new Map(revealPairs.map((p) => [p.leftKey, p.rightKey]));
  const explanation = reveal?.explanation;

  function pickLeft(key: string) {
    if (isAnswered) return;
    if (draft[key] !== undefined) {
      // Тап по вже зіставленому рядку знімає пару — інакше помилку
      // неможливо виправити, не почавши все спочатку.
      setDraft((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setActiveLeft(key);
      return;
    }
    setActiveLeft(activeLeft === key ? null : key);
  }

  function pickRight(rightKey: string) {
    if (isAnswered || activeLeft === null) return;
    setDraft((prev) => {
      const next = { ...prev };
      // Праву частину не можна віддати двом лівим одразу.
      for (const k of Object.keys(next)) if (next[k] === rightKey) delete next[k];
      next[activeLeft] = rightKey;
      return next;
    });
    setActiveLeft(null);
  }

  const allLinked = Object.keys(draft).length === lefts.length;

  function check() {
    if (isAnswered) return;
    onAnswer(answerFor("matching", component.content, { links: draft }));
  }

  /** Який номер пари показати біля елемента — щоб зв'язок було видно без ліній. */
  function badgeFor(leftKey: string) {
    return links[leftKey] === undefined ? null : Object.keys(links).indexOf(leftKey) + 1;
  }
  const pairClass = (leftKey: string) => (links[leftKey] === undefined ? "" : ` pair-${(badgeFor(leftKey)! - 1) % 6}`);

  // Після перевірки праві елементи стають навпроти своїх пар: порядок міняємо
  // в DOM, а переїзд малюємо FLIP-ом (старе положення -> нове).
  const rightsView = (() => {
    if (!isAnswered) return rights;
    const pos = (rightKey: string) => {
      const owner = Object.keys(links).find((k) => links[k] === rightKey);
      return owner === undefined ? Number.MAX_SAFE_INTEGER : lefts.findIndex((l) => l.key === owner);
    };
    return [...rights].sort((a, b) => pos(a.key) - pos(b.key));
  })();
  const rightRefs = useRef(new Map<string, HTMLLIElement>());
  const prevTops = useRef(new Map<string, number>());
  const slid = useRef(false);
  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();
    rightRefs.current.forEach((el, key) => {
      const top = el.offsetTop;
      const prev = prevTops.current.get(key);
      if (isAnswered && !slid.current && !reduced && prev !== undefined && Math.abs(prev - top) > 1) {
        el.style.transition = "none";
        el.style.transform = `translateY(${prev - top}px)`;
        void el.offsetHeight;
        el.style.transition = "transform 0.9s cubic-bezier(0.45, 0.05, 0.3, 1)";
        el.style.transform = "";
      }
      prevTops.current.set(key, top);
    });
    if (isAnswered) slid.current = true;
  });

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
          {lefts.map((left) => {
            const linked = links[left.key] !== undefined;
            // Вердикт по парах — лише коли сервер віддав правильні пари (відповідь правильна).
            const marked = graded && revealPairs.length > 0;
            const correct = marked && links[left.key] === correctRightOf.get(left.key);
            return (
              <li key={left.key}>
                <button
                  type="button"
                  className={`q-match-item${activeLeft === left.key ? " is-active" : ""}${linked ? " is-linked" : ""}${pairClass(left.key)}${
                    marked ? (correct ? " is-correct" : " is-wrong") : ""
                  }`}
                  onClick={() => pickLeft(left.key)}
                  disabled={isAnswered}
                >
                  <span>{renderRichMarks(left.text)}</span>
                  {linked && <b className="q-match-badge">{badgeFor(left.key)}</b>}
                </button>
              </li>
            );
          })}
        </ul>
        <ul className="q-match-col">
          {rightsView.map((right) => {
            const ownerLeft = Object.keys(links).find((k) => links[k] === right.key);
            const linked = ownerLeft !== undefined;
            const rightMarked = graded && revealPairs.length > 0;
            const rightCorrect = rightMarked && linked && correctRightOf.get(ownerLeft!) === right.key;
            return (
              <li
                key={right.key}
                ref={(el) => {
                  if (el) rightRefs.current.set(right.key, el);
                  else rightRefs.current.delete(right.key);
                }}
              >
                <button
                  type="button"
                  className={`q-match-item${linked ? " is-linked" : ""}${linked ? pairClass(ownerLeft!) : ""}${
                    rightMarked ? (rightCorrect ? " is-correct" : " is-wrong") : ""
                  }`}
                  onClick={() => pickRight(right.key)}
                  disabled={isAnswered || activeLeft === null}
                >
                  <span>{renderRichMarks(right.text)}</span>
                  {linked && <b className="q-match-badge">{badgeFor(ownerLeft!)}</b>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {(!isAnswered || checking) && (
        <button
          type="button"
          className={`btn-primary-full${checking ? " is-checking" : ""}`}
          onClick={check}
          disabled={!allLinked}
          aria-busy={checking}
        >
          <span className="btn-label">{allLinked ? "Перевірити" : "Зіставте всі пари"}</span>
        </button>
      )}

      <AnswerStatus answer={answer} />

      {graded && (
        <div className={`q-fb show ${answer!.correct ? "ok" : "bad"}`}>
          <b className="q-fb-verdict">{answer!.correct ? "Правильно! Усі пари вірні." : "Не всі пари вірні."}</b>
          {!answer!.correct && revealPairs.length > 0 && (
            <ul className="q-fb-options">
              {revealPairs.map((p) => (
                <li key={p.leftKey} className={links[p.leftKey] === p.rightKey ? "is-correct" : "is-wrong"}>
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
