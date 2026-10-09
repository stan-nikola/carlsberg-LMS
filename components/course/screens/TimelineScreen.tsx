"use client";

import { useEffect, useRef, useState } from "react";
import { peekScrollTo } from "@/lib/scrollHints";
import { nextTimelineTarget } from "@/lib/coursePlayerLogic";
import { renderRichText, renderRichMarks } from "@/lib/richText";
import { Kicker, ScreenMedia } from "@/components/course/screens/media";
import { EMPTY_CONTENT, type ScreenProps } from "@/components/course/screens/types";

/* ===================== TIMELINE (кроки візиту / recap) ===================== */

export function TimelineScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }: ScreenProps) {
  const { kicker, lead, images = [], steps = [], highlight } = component.content || EMPTY_CONTENT;
  // Набір відкритих індексів (не один) — раніше відкриття нового кроку
  // автоматично згортало попередній (одна змінна openIdx), і людина, що
  // гортає вниз по списку, бачила, як щойно прочитане ховається саме
  // собою. Тепер кожен крок вмикається/вимикається незалежно й лишається
  // відкритим, поки не тапнути по ньому ще раз.
  const [openSet, setOpenSet] = useState(() => new Set<number>());
  const [everOpened, setEverOpened] = useState(() => new Set<number>());

  // У режимі "ви тут" гейт зараховує лише підсвічений крок — решта
  // відкриваються вільно, але не вимагаються (recap-екрани в legacy).
  const highlightIdx = highlight ? Number(highlight) - 1 : null;

  useEffect(() => {
    if (highlightIdx != null) onGateProgress?.(everOpened.has(highlightIdx) ? 1 : 0);
    else onGateProgress?.(everOpened.size);
  }, [everOpened, highlightIdx, onGateProgress]);

  const listRef = useRef<HTMLDivElement>(null);
  // Крок для переливу «тапни сюди»: без highlight — перший невідкритий,
  // з highlight — лише підсвічений (див. nextTimelineTarget, чому не
  // «перший невідкритий» в обох режимах).
  const nextIdx = readOnly || !tapHint ? -1 : nextTimelineTarget(steps.length, everOpened, highlightIdx);
  // Методичка: усі кроки розкриті, заголовки не клікаються.
  const isOpen = (i: number) => readOnly || openSet.has(i);

  function toggle(i: number) {
    if (readOnly) return;
    const opening = !openSet.has(i);
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    setEverOpened((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
    // Розкрили — підводимо наступний крок, а сам розкритий текст лишаємо на
    // екрані (keepVisible), як в акордеоні. Згортання екран не смикає.
    if (!opening) return;
    const children = listRef.current?.children;
    requestAnimationFrame(() => peekScrollTo(children?.[i + 1], { keepVisible: children?.[i] }));
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />
      <div className="timeline" ref={listRef}>
        {steps.map((step, i) => (
          <div
            key={i}
            className={`tl-item${isOpen(i) ? " open" : ""}${readOnly || everOpened.has(i) ? " seen" : ""}${
              highlightIdx === i ? " current" : ""
            }`}
          >
            {/* Рейка зліва — номер-кружечок + сполучна лінія до наступного
                кроку, щоб читалось як один ланцюжок, а не набір окремих
                карток. Лінія лишається сірою, поки крок НЕ відкрито —
                зафарбовується услід за самим кружечком (клас .seen),
                показуючи пройдений відрізок ланцюга. */}
            <div className="tl-rail" aria-hidden="true">
              <span className="tl-num">{i + 1}</span>
              {i < steps.length - 1 && <span className="tl-line" />}
            </div>
            <div className="tl-body">
              {readOnly ? (
                <div className="tl-head tl-head--static">
                  <span className="tl-title">{renderRichMarks(step.title) || `Крок ${i + 1}`}</span>
                </div>
              ) : (
                <button
                  type="button"
                  className={`tl-head${i === nextIdx ? " tap-next" : ""}`}
                  onClick={() => toggle(i)}
                  aria-expanded={openSet.has(i)}
                >
                  <span className="tl-title">{renderRichMarks(step.title) || `Крок ${i + 1}`}</span>
                </button>
              )}
              {/* Деталь крока рендериться ЗАВЖДИ, а розкривається класом:
                  умовний рендер не дає чого анімувати — елемент з'являється
                  вже на повну висоту, і крок «стрибає». Обгортка тримає
                  саму анімацію висоти, .tl-detail лишається зі своїми
                  відступами. */}
              {step.detail && (
                <div className={`tl-detail-wrap${isOpen(i) ? " open" : ""}`} aria-hidden={!isOpen(i)}>
                  <div className="tl-detail">{renderRichText(step.detail)}</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
