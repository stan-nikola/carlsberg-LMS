"use client";

import { useEffect, useState } from "react";
import { renderRichMarks } from "@/lib/richText";
import { CourseImage, Kicker } from "@/components/course/screens/media";
import { EMPTY_CONTENT, type ScreenProps } from "@/components/course/screens/types";

/* ===================== ДО / ПІСЛЯ ===================== */

/**
 * Два фото в одній рамці з перемикачем. Гейт — перемкнути хоча б раз.
 *
 * Чому перемикач, а не «шторка» з повзунком, як у багатьох галереях:
 * повзунок вимагає тягнути пальцем рівно по вузькій ручці, а тут
 * телефонний застосунок для польових умов — у проєкті вже є рішення не
 * робити механік на перетягуванні. Тап по кадру дає ту саму головну
 * цінність: обидва стани показуються В ОДНИХ І ТИХ САМИХ межах кадру,
 * тож око бачить різницю миттєво, не переносячи погляд між двома фото.
 */
export function BeforeAfterScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }: ScreenProps) {
  const { kicker, lead, images = [], beforeLabel, afterLabel } = component.content || EMPTY_CONTENT;
  const valid = (images || []).filter((img) => img.url);
  const [showAfter, setShowAfter] = useState(readOnly);
  const [switched, setSwitched] = useState(readOnly);

  useEffect(() => {
    onGateProgress?.(switched ? 1 : 0);
  }, [switched, onGateProgress]);

  if (valid.length < 2) {
    return (
      <>
        <Kicker screenNumber={screenNumber} text={kicker} />
        {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
        <p className="cp-lead">Для цього екрана потрібні два фото — «до» і «після».</p>
      </>
    );
  }

  const labels = [beforeLabel || "Було", afterLabel || "Стало"];
  const shown = valid[showAfter ? 1 : 0];

  function toggle(next: boolean) {
    if (readOnly) return;
    setShowAfter(next);
    if (next) setSwitched(true);
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}

      <div className="ba-frame">
        {/* Обидва фото лежать одне на одному й лише міняють прозорість:
            так кадр не «стрибає» при перемиканні, навіть якщо знімки
            трохи різних пропорцій, і перехід виходить плавним. */}
        {valid.slice(0, 2).map((img, i) => (
          <div key={i} className={`ba-layer${(i === 1) === showAfter ? " is-on" : ""}`} aria-hidden={(i === 1) !== showAfter}>
            <CourseImage src={img.url} alt={img.caption || labels[i]} zoomable={typeof onZoomImage === "function"} />
          </div>
        ))}
        <span className={`ba-badge${showAfter ? " is-after" : ""}`}>{labels[showAfter ? 1 : 0]}</span>
      </div>

      {!readOnly && (
        <div className="ba-switch" role="group" aria-label="Порівняння">
          {labels.map((label, i) => (
            <button
              key={i}
              type="button"
              className={`ba-switch-btn${(i === 1) === showAfter ? " is-on" : ""}${!switched && i === 1 && tapHint ? " tap-next" : ""}`}
              onClick={() => toggle(i === 1)}
              aria-pressed={(i === 1) === showAfter}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {shown?.caption && <div className="cp-photo-caption">{renderRichMarks(shown.caption)}</div>}
    </>
  );
}
