"use client";

import { useState } from "react";
import { answerFor, isAnswerDone } from "@/lib/grading";
import { AnswerStatus } from "@/components/course/AnswerStatus";
import { renderRichMarks } from "@/lib/richText";
import { zoneShapeClass, zoneStyle, type HotspotZone } from "@/lib/hotspotZones";
import { CourseImage, Kicker } from "@/components/course/screens/media";
import { EMPTY_CONTENT, type QuestionScreenProps } from "@/components/course/screens/types";

/* ===================== HOTSPOT (гаряча точка на фото) ===================== */

/**
 * Знайти й натиснути потрібне місце на фото. Це ПИТАННЯ: результат іде в
 * бал нарівні з quiz, тому компонент повідомляє нагору onAnswer(boolean),
 * а не onGateProgress.
 *
 * Зони зберігаються у ВІДСОТКАХ від розміру зображення — те саме фото
 * показується і на телефоні, і на ноутбуці, піксельні координати там
 * розійшлися б. Влучанням вважається клік усередині будь-якої зони:
 * "покажи помилку на полиці" часто має кілька однаково правильних
 * відповідей.
 *
 * Фото навмисно НЕ відкривається в лайтбоксі, поки не відповіли: інакше
 * тап по зображенню означав би дві різні дії одночасно.
 */
export function HotspotScreen({ component, screenNumber, answer, onAnswer }: QuestionScreenProps) {
  // Зон у плеєрі немає (lib/grading.ts publicContent, 2026-09-27): місце
  // кліку йде на сервер, зони й пояснення приходять у розборі після відповіді.
  const { kicker, lead, images = [] } = component.content || EMPTY_CONTENT;
  const [localClick, setClick] = useState<{ x: number; y: number } | null>(null);
  // Поки фото не завантажилось, натискати нікуди: людина ще не бачить, що
  // саме шукає, а координати рахувались би по порожньому скелетону — і
  // відповідь записалась би за картинку, якої вона не бачила.
  const [imgReady, setImgReady] = useState(false);
  const checking = answer?.status === "checking";
  const graded = typeof answer?.correct === "boolean";
  const isAnswered = checking || isAnswerDone(answer);
  const reveal = (graded ? answer?.reveal : null) as { zones?: HotspotZone[]; explanation?: string } | null | undefined;
  const zones = reveal?.zones || [];
  const explanation = reveal?.explanation;
  const stored = answer?.response as { x?: number; y?: number } | undefined;
  const click = localClick || (stored && Number.isFinite(stored.x) ? { x: stored.x as number, y: stored.y as number } : null);
  const image = images.find((img) => img.url);

  function handleClick(e: React.MouseEvent<HTMLElement>) {
    if (isAnswered || !image || !imgReady) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // Фото ще не завантажилось (або блок прихований) — кадр нульового
    // розміру. Без цієї перевірки ділення дає NaN, влучання не
    // зараховується, і людині записується НЕПРАВИЛЬНА відповідь просто за
    // те, що вона натиснула раніше, ніж підвантажилась картинка. Нічого
    // не фіксуємо — хай натисне ще раз.
    if (!rect.width || !rect.height) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setClick({ x, y });
    // Влучання рахує lib/grading.ts (isHotspotHit усередині) — на сервері в
    // плеєрі й локально в прев'ю конструктора, тим самим кодом.
    onAnswer(answerFor("hotspot", component.content, { x, y, aspect: rect.height / rect.width }));
  }

  if (!image) {
    return (
      <>
        <Kicker screenNumber={screenNumber} text={kicker} />
        {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
        <p className="cp-lead">Для цього питання ще не додано фото.</p>
      </>
    );
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}

      <div
        className={`hs-frame${isAnswered ? " answered" : ""}${imgReady ? "" : " loading"}`}
        onClick={handleClick}
        role={isAnswered ? undefined : "button"}
        tabIndex={isAnswered ? undefined : 0}
        aria-label={isAnswered ? undefined : "Натисніть потрібне місце на фото"}
      >
        <CourseImage src={image.url} alt={image.caption || component.title || ""} onLoaded={() => setImgReady(true)} />

        {/* Правильні зони показуємо ЛИШЕ після відповіді — інакше питання
            не мало б сенсу. */}
        {/* solo — коли правильне місце ОДНЕ: тоді решту знімка можна
            приглушити, лишивши яскравою саму зону (CSS робить це величезною
            зовнішньою тінню, обрізаною рамкою кадру). При кількох зонах
            такий прийом не працює: тінь однієї зони приглушила б сусідню,
            тож там лишається просто підсвітка без затемнення. */}
        {graded &&
          zones.map((z, i) => (
            <span
              key={i}
              className={`hs-zone ${zoneShapeClass(z)}${zones.length === 1 ? " solo" : ""}`}
              style={zoneStyle(z)}
            />
          ))}

        {click && (
          // Пін — та сама «крапля», що й кружечок у тесті: тоне, поки
          // перевіряємо, виринає кольором вердикту (лише для щойно даної відповіді).
          <span
            className={`hs-pin${graded ? (answer.correct ? " ok" : " bad") : ""}${checking ? " is-checking" : graded && localClick ? " is-verdict" : ""}`}
            style={{ left: `${click.x}%`, top: `${click.y}%` }}
          />
        )}
      </div>
      {image.caption && <div className="cp-photo-caption">{renderRichMarks(image.caption)}</div>}

      <AnswerStatus answer={answer} />

      {graded && (
        <div className={`q-fb show ${answer.correct ? "ok" : "bad"}`}>
          <b className="q-fb-verdict">{answer.correct ? "Влучно!" : "Не те місце. Спробуйте ще раз у наступній спробі."}</b>
          {explanation && <span className="q-fb-explain">{renderRichMarks(explanation)}</span>}
        </div>
      )}
    </>
  );
}
