"use client";

import { useEffect, useEffectEvent } from "react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

/** Відкриті оверлеї в порядку відкриття: Esc закриває лише верхній
 *  (інструкція встановлення поверх шторки налаштувань — не обидва разом). */
const openStack: symbol[] = [];

/**
 * Поведінка будь-якого оверлея/модалки, поки він відкритий: Esc закриває,
 * сторінка під ним не скролиться. Клік по фону кожен оверлей робить сам
 * (`e.target === e.currentTarget`), бо розмітка в них різна.
 */
export function useDismiss(onClose: () => void, active = true) {
  const close = useEffectEvent(onClose);
  useBodyScrollLock(active);
  useEffect(() => {
    if (!active) return undefined;
    const id = Symbol("overlay");
    openStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openStack[openStack.length - 1] === id) close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      openStack.splice(openStack.indexOf(id), 1);
    };
  }, [active]);
}
