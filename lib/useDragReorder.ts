"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { moveAdjacent, reorderBefore } from "@/lib/dragReorder";

/** Скільки пікселів руху вважати «ще не тягнемо» — не смикати рядок на
 *  тремтіння пальця при звичайному натисканні на ручку. */
const CLICK_SLOP_PX = 4;
/** Той самий темп, що й FLIP карток у кабінеті керівника
 *  (components/ManagerDashboard.jsx) — узгоджений почерк анімацій. */
const FLIP_DURATION_MS = 220;
const FLIP_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * Перетягування ОДНОВИМІРНОГО (вертикального) списку мишею чи пальцем, із
 * FLIP-анімацією сусідів (Web Animations API) — та сама механіка, що вже
 * перевірена на картках дашборда керівника (ManagerDashboard.jsx
 * moveCardBefore/handleCardPointerMove), спрощена до однієї осі й
 * винесена сюди: рівно та сама потреба одразу в двох місцях — конструктор
 * («Порядок кроків», AdminCourseEditor.jsx OrderingFields — список
 * об'єктів `{text}`) і сам плеєр (OrderingScreen, QuestionScreens.tsx —
 * список позицій-чисел), — щоб не писати драг двічі й не розходитись у
 * поведінці.
 *
 * `T` — тип елемента `ids`: НЕ обов'язково рядок/число. Ідентичність
 * рядка на екрані прив'язана до DOM-вузла через WeakMap (`registerRow`),
 * а не до серіалізації id в data-атрибут — тому конструктор може
 * передати сюди прямі референси об'єктів `{text}` (вони лишаються тими
 * самими референсами між рендерами, поки автор не редагує саме цей
 * рядок), а плеєр — числа позицій. Жодного окремого лічильника
 * синтетичних id заводити не треба.
 *
 * Обробники руху/відпускання — на КОНТЕЙНЕРІ (делеговано), а не на
 * кожному рядку: pointer capture лишається на одному стабільному вузлі,
 * тоді як рядок ПІД пальцем визначається на льоту через elementFromPoint
 * і може мінятись у процесі перетягування.
 *
 * Тягнути можна за БУДЬ-яку точку картки, не лише за ручку (grip-іконку):
 * ручка лишається єдиним місцем, куди можна натиснути КЛАВІАТУРОЮ
 * (стрілки вгору/вниз на фокусі), решта картки — просто ширша зона
 * захоплення для миші/пальця. Виняток — інші "живі" елементи всередині
 * рядка (текстове поле, кнопка видалення): по них драг не стартує,
 * інакше клік у поле вводу конструктора тягав би картку замість того,
 * щоб поставити курсор у текст.
 *
 * Рядок, узятий у руку, отримує inline-transform від dragDeltaY напряму
 * (без анімації — миттєво йде за пальцем); решта рядків «доїжджають» до
 * нових місць через FLIP. Коли перестановка змінює ВЛАСНУ позицію взятого
 * рядка в потоці (переставили повз кількох сусідів одразу), точку
 * відліку pointerStartY підправляємо на різницю — інакше рядок у руці
 * стрибав би щоразу, як пересувались інші (той самий прийом, що в
 * ManagerDashboard: dragRef.current.startX/Y += shift).
 */
export function useDragReorder<T>({
  ids,
  onReorder,
  disabled = false,
}: {
  ids: T[];
  onReorder: (next: T[]) => void;
  disabled?: boolean;
}) {
  const [dragId, setDragId] = useState<T | null>(null);
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const containerRef = useRef<HTMLElement | null>(null);
  // WeakMap, а не звичайний Map: рядки монтуються/розмонтовуються (додали/
  // видалили крок), і без цього тут накопичувались би мертві вузли —
  // WeakMap прибирає їх сам разом зі збіркою сміття DOM-вузла.
  const nodeToIdRef = useRef(new WeakMap<HTMLElement, T>());
  const dragRef = useRef<{ id: T; startY: number; pressY: number; moved: boolean } | null>(null);
  const lastSwapRef = useRef<T | null>(null);
  const rowTopsRef = useRef(new Map<T, number>());

  /** ref callback-фабрика: реєструє, який DOM-вузол відповідає якому id. */
  function registerRow(id: T) {
    return (node: HTMLElement | null) => {
      if (node) nodeToIdRef.current.set(node, id);
    };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return;
    const row = (e.target as HTMLElement)?.closest?.("[data-drag-row]") as HTMLElement | null;
    if (!row) return;
    // Тягнути можна за БУДЬ-яке місце картки (прохання користувача
    // 2026-09-23 — "не только за шесть точечек, а за весь блок"), крім
    // елементів, з якими людина працює напряму: ручка (data-drag-handle)
    // лишається завжди активною (і клавіатурним фокусом теж), а решта
    // "живих" елементів рядка — текстове поле, кнопка видалення —
    // виключена з драгу, інакше клік у поле вводу конструктора тягав би
    // картку замість того, щоб поставити курсор у текст.
    const isHandle = (e.target as HTMLElement)?.closest?.("[data-drag-handle]");
    if (!isHandle) {
      const interactive = (e.target as HTMLElement)?.closest?.('button, input, textarea, select, a, [contenteditable="true"]');
      if (interactive) return;
    }
    // Тільки основна кнопка миші / дотик — правою кнопкою нічого не тягнемо.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const id = nodeToIdRef.current.get(row);
    if (id === undefined) return;
    e.preventDefault();
    const container = e.currentTarget as HTMLElement;
    dragRef.current = { id, startY: e.clientY, pressY: e.clientY, moved: false };
    try {
      container.setPointerCapture(e.pointerId);
    } catch {
      // Вказівник уже відпущено — тягнемо без захоплення, події й так
      // прийдуть на контейнер (він у потоці подій вище рядків).
    }
    setDragId(id);
    setDragDeltaY(0);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientY - drag.pressY) > CLICK_SLOP_PX) drag.moved = true;
    setDragDeltaY(e.clientY - drag.startY);
    // Рядок під пальцем: узятий рядок має pointer-events:none (CSS
    // .is-dragging), тож elementFromPoint бачить те, що під ним.
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const overRow = under?.closest?.("[data-drag-row]") as HTMLElement | null | undefined;
    const overId = overRow ? nodeToIdRef.current.get(overRow) : undefined;
    if (overId === undefined || overId === drag.id) {
      lastSwapRef.current = null;
      return;
    }
    if (overId === lastSwapRef.current) return;
    lastSwapRef.current = overId;
    const next = reorderBefore(ids, drag.id, overId);
    if (next !== ids) onReorder(next);
  }

  function handlePointerUp() {
    dragRef.current = null;
    lastSwapRef.current = null;
    setDragId(null);
    setDragDeltaY(0);
  }

  // FLIP: після перестановки рядки просто "телепортувались" би на нові
  // місця — тут кожен, крім узятого, стартує з попередньої позиції й
  // доїжджає в нову. offsetTop (не getBoundingClientRect) — той самий
  // прийом, що в ManagerDashboard: transform не бере участі в layout,
  // тож offsetTop завжди повертає "справжню" позицію в потоці.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const prevTops = rowTopsRef.current;
    const nextTops = new Map<T, number>();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.visibilityState !== "visible";
    for (const node of container.querySelectorAll<HTMLElement>("[data-drag-row]")) {
      const id = nodeToIdRef.current.get(node);
      if (id === undefined) continue;
      const top = node.offsetTop;
      nextTops.set(id, top);
      const old = prevTops.get(id);
      if (id === dragId) {
        // Узятий рядок: якщо його ВЛАСНА позиція в потоці змінилась
        // (переставили повз кількох рядків одразу), переприв'язуємо
        // точку відліку — інакше він стрибав би на цю різницю.
        if (old != null && dragRef.current && top !== old) {
          const shift = top - old;
          dragRef.current.startY += shift;
          setDragDeltaY((d) => d - shift);
        }
        continue;
      }
      if (reduced || old == null) continue;
      const dy = old - top;
      if (!dy) continue;
      // Гасимо попередній переїзд цього ж рядка, якщо ще триває — інакше
      // два FLIP накладаються й рядок "смикається" вдвічі.
      node.getAnimations?.().forEach((a) => a.cancel());
      node.animate?.([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
        duration: FLIP_DURATION_MS,
        easing: FLIP_EASING,
      });
    }
    rowTopsRef.current = nextTops;
  }, [ids, dragId]);

  function moveByKeyboard(id: T, dir: -1 | 1) {
    const next = moveAdjacent(ids, id, dir);
    if (next !== ids) onReorder(next);
  }

  return {
    containerRef,
    containerProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
    registerRow,
    dragId,
    dragDeltaY,
    moveByKeyboard,
  };
}
