"use client";

import type { ComponentType } from "react";
import { InfoFields, QuizFields, AccordionFields, ChecklistFields, ScriptFields, TimelineFields, PhotoFields } from "@/components/course-editor/fields/content";
import { HotspotFields, ImagePinsFields } from "@/components/course-editor/fields/hotspot";
import { BeforeAfterFields, OrderingFields, MatchingFields, InputFields } from "@/components/course-editor/fields/questions";
import type { FieldProps } from "@/components/course-editor/types";

/** Редактор полів кожного типу компонента. Новий тип = рядок у
 *  lib/componentTypes.js + рядок тут; невідомий тип редагується як інфо-блок. */
const FIELDS_BY_TYPE: Record<string, ComponentType<FieldProps>> = {
  accordion: AccordionFields,
  checklist: ChecklistFields,
  script: ScriptFields,
  timeline: TimelineFields,
  photo: PhotoFields,
  hotspot: HotspotFields,
  ordering: OrderingFields,
  matching: MatchingFields,
  imagepins: ImagePinsFields,
  beforeafter: BeforeAfterFields,
  input: InputFields,
};

export function ComponentTypeFields({ type, componentId, ...fieldProps }: FieldProps & { type: string; componentId: number }) {
  // Quiz — єдиний, кому потрібне унікальне ім'я групи радіокнопок.
  if (type === "quiz") return <QuizFields {...fieldProps} radioGroupName={`qtype-${componentId}`} />;
  const Fields = FIELDS_BY_TYPE[type] ?? InfoFields;
  return <Fields {...fieldProps} />;
}
