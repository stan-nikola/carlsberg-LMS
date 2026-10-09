"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "@/components/ui/icons";
import { renderRichMarks } from "@/lib/richText";
import { MorphRevealIcon } from "@/components/ui/MorphRevealIcon";
import { Kicker, ScreenMedia } from "@/components/course/screens/media";
import { EMPTY_CONTENT, type ScreenProps } from "@/components/course/screens/types";

/* ===================== CHECKLIST ===================== */

export function ChecklistScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }: ScreenProps) {
  const { kicker, lead, images = [], items = [] } = component.content || EMPTY_CONTENT;
  const [checked, setChecked] = useState(() => new Set<number>());
  const nextIdx = readOnly || !tapHint ? -1 : items.findIndex((_, i) => !checked.has(i));

  useEffect(() => {
    onGateProgress?.(checked.size);
  }, [checked, onGateProgress]);

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />
      <div className="check-list">
        {items.map((item, i) =>
          readOnly ? (
            // Методичка: статичний список з галочками, нічого не відмічати.
            <div key={i} className="check-item done check-item--static">
              <span className="check-box">
                <CheckIcon />
              </span>
              <span className="check-text">{renderRichMarks(item.text)}</span>
            </div>
          ) : (
            <button
              key={i}
              type="button"
              className={`check-item${checked.has(i) ? " done" : ""}${i === nextIdx ? " tap-next" : ""}`}
              onClick={() => toggle(i)}
              aria-pressed={checked.has(i)}
            >
              {/* Галочка з'являється тим самим морфом, що й у варіантах
                  відповіді (components/course/player/CoursePlayer.tsx) — один почерк на
                  весь застосунок. Рендериться ЛИШЕ коли пункт відмічено:
                  MorphRevealIcon промальовується на монтуванні, тож
                  постійно присутня й лише пофарбована в прозоре іконка
                  (як було) анімації не дала б узагалі.
                  Без label — стан уже озвучено через aria-pressed самої
                  кнопки, друга озвучка була б дублем. */}
              <span className="check-box">
                {checked.has(i) && <MorphRevealIcon shape="check" size={14} strokeWidth={3} className="check-mark" />}
              </span>
              <span className="check-text">{renderRichMarks(item.text)}</span>
            </button>
          )
        )}
      </div>
    </>
  );
}
