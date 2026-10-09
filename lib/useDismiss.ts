"use client";

import { useEffect, useEffectEvent } from "react";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}
