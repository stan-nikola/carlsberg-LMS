"use client";

import { useEffect } from "react";

/**
 * Поки відкрито оверлей — сторінка під ним не скролиться.
 *
 * Було п'ять однакових копій цього ефекту по компонентах (лайтбокс фото,
 * картка співробітника, гайд встановлення, обидві модалки прев'ю в
 * конструкторі) — і в кожній той самий недолік: `overflow:hidden` прибирає
 * смугу прокрутки, вміст під оверлеєм стрибає праворуч на її ширину
 * (~15px на Windows, де смуга займає місце в розкладці). Тому лок тут
 * одразу з компенсацією: скільки пікселів забрала смуга, стільки додаємо
 * в padding-right. Оверлеї це не зсуває — вони `position:fixed`, а отже
 * рахуються від вьюпорта, а не від padding-box елемента body.
 *
 * Вкладені локи (лайтбокс фото ВСЕРЕДИНІ модалки прев'ю — цілком реальний
 * шлях) працюють правильно самі собою: внутрішній запам'ятовує вже
 * заблокований стан і повертає саме його, а смуги на той момент уже нема,
 * тож і компенсація вдруге не додається.
 *
 * Скрол ВСЕРЕДИНІ оверлея не зачіпається — блокується лише сторінка під
 * ним (екран телефона в прев'ю, .cp-viewport, скролиться як і раніше).
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    // Читаємо ДО того, як міняємо overflow: після цього смуга зникне, і
    // clientWidth уже дорівнюватиме innerWidth.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const basePadding = parseFloat(getComputedStyle(body).paddingRight) || 0;

    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${basePadding + scrollbar}px`;

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [active]);
}
