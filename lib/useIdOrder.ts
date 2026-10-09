"use client";

import { useMemo } from "react";
import { api } from "@/lib/api";
import { useDragReorder } from "@/lib/useDragReorder";

type WithId = { id: number };

/**
 * Новий порядок модулів / екранів / компонентів: order переписується УСІМ
 * (1..N), а не міняється місцями пара значень — при однакових order база
 * вертає рядки в довільному порядку, і курс у плеєрі «плавав» би.
 * Наскрізна нумерація питань окремого нічого не потребує: і конструктор
 * (numberComponents), і плеєр рахують номер від порядку в списку.
 */
export function saveOrder<T extends WithId>(resource: "modules" | "screens" | "components", items: T[]): (T & { order: number })[] {
  const withOrder = items.map((item, i) => ({ ...item, order: i + 1 }));
  Promise.all(
    withOrder.map((item) => api(`/api/admin/${resource}/${item.id}`, { method: "PATCH", body: { order: item.order } }))
  ).catch(() => {});
  return withOrder;
}

/**
 * useDragReorder для списку записів бази, що тягнуться лише за ручку.
 * Ідентичність рядка — id, а не сам об'єкт: saveOrder створює нові об'єкти,
 * і взятий рядок інакше губився б після першої ж перестановки (скарга
 * користувача 2026-09-23). useMemo тримає масив незмінним, доки порядок
 * справді не змінився — на ньому висить FLIP.
 */
export function useIdOrder<T extends WithId>(items: T[], onReorder: (next: T[]) => void) {
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  return useDragReorder({
    ids,
    handleOnly: true,
    onReorder: (nextIds) => {
      const byId = new Map(items.map((item) => [item.id, item]));
      onReorder(nextIds.flatMap((id) => byId.get(id) ?? []));
    },
  });
}
