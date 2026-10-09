"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * FLIP-перестановка дітей контейнера (2026-10-04, стенд Motion Tuner «I»):
 * після кожного рендера порівнює позиції дітей з `data-flip-key` із
 * попередніми; той, хто змінив місце, отримує зворотний transform і за один
 * кадр плавно їде на нове (клас `is-flipping` + transition у CSS). Новим і
 * зниклим рядкам нічого не робимо. «Зменшити рух» — transition глушить
 * глобальне правило в globals.css.
 */
export function useFlip(ref: RefObject<HTMLElement | null>) {
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const next = new Map<string, number>();
    const moved: { el: HTMLElement; dy: number }[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("[data-flip-key]")) {
      const key = el.dataset.flipKey!;
      const top = el.getBoundingClientRect().top;
      next.set(key, top);
      const was = prev.current.get(key);
      if (was != null && Math.abs(was - top) > 0.5) moved.push({ el, dy: was - top });
    }
    prev.current = next;
    if (moved.length === 0) return;
    for (const { el, dy } of moved) {
      el.classList.remove("is-flipping");
      el.style.transform = `translateY(${dy}px)`;
    }
    void root.offsetWidth;
    const raf = requestAnimationFrame(() => {
      for (const { el } of moved) {
        el.classList.add("is-flipping");
        el.style.transform = "";
        el.addEventListener("transitionend", () => el.classList.remove("is-flipping"), { once: true });
      }
    });
    return () => cancelAnimationFrame(raf);
  });
}
