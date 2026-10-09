"use client";

import { useEffect, useState } from "react";
import { renderRichMarks } from "@/lib/richText";
import { Kicker } from "@/components/course/screens/media";
import { EMPTY_CONTENT, type ScreenProps } from "@/components/course/screens/types";

/* ===================== INPUT (довільне текстове поле) ===================== */

/**
 * Гейт "щось введено" — саме значення НІКУДИ не зберігається (ні в БД, ні
 * навіть у стані плеєра вище за цей компонент), лишається тільки в
 * локальному useState на час, поки екран змонтовано. Повернувшись на цей
 * екран пізніше, поле знову порожнє — так і задумано, це не форма зі
 * збереженням відповіді, а спосіб "змусити задуматись" перед тим, як
 * пустити далі.
 */
export function InputScreen({ component, screenNumber, onGateProgress }: ScreenProps) {
  const { kicker, label, placeholder, multiline } = component.content || EMPTY_CONTENT;
  const [value, setValue] = useState("");

  useEffect(() => {
    onGateProgress?.(value.trim() ? 1 : 0);
  }, [value, onGateProgress]);

  const Field = multiline ? "textarea" : "input";

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {label && <label className="cp-input-label">{label}</label>}
      <Field
        className="cp-input-field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder || ""}
        rows={multiline ? 4 : undefined}
      />
    </>
  );
}
