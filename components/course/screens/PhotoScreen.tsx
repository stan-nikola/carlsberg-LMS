"use client";

import { renderRichMarks } from "@/lib/richText";
import { NoteAccordion, Kicker, ScreenMedia } from "@/components/course/screens/media";
import { EMPTY_CONTENT, type ScreenProps } from "@/components/course/screens/types";

/* ===================== PHOTO (фото та відео) ===================== */

/**
 * Обгортка навколо медіа: рубрика, заголовок, вступний рядок, саме фото
 * чи ролик — і «Варто знати» під ним. Той самий набір полів і той самий
 * порядок, що в усіх решти типів екрана: фото без жодного тексту читалось
 * як загублений слайд, і автору доводилось заводити окремий інфо-екран
 * поруч, аби підписати, що саме показано.
 *
 * Розмітку медіа НЕ дублюємо — беремо спільний ScreenMedia: до цього тут
 * лежала власна копія рамки, і будь-яка зміна (лупа, відео, підпис)
 * мовчки проходила повз саме той екран, який і створений заради фото.
 */
export function PhotoScreen({ component, screenNumber, onZoomImage }: ScreenProps) {
  const { kicker, lead, note, images = [] } = component.content || EMPTY_CONTENT;
  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />
      {note && <NoteAccordion note={note} />}
    </>
  );
}
