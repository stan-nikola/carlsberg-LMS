"use client";

import { useEffect, useRef, useState } from "react";

/**
 * «Що бачили на цьому пристрої минулого разу» (localStorage) для анімацій
 * «новий рівень», «↑ N місць», «модуль відкрився» (2026-10-04). Повертає
 * ПОПЕРЕДНЄ значення лише коли воно є і відрізняється від поточного, інакше
 * null (перший візит, без змін, без localStorage). Поточне значення
 * записується одразу. Читання/запис — рівно один раз на монтування (ref):
 * у dev StrictMode ефект проганяється двічі, і другий прохід без цього
 * бачив би вже перезаписане значення — анімація ніколи б не стартувала.
 * `storageKey: null` — вимкнено (прев'ю конструктора).
 */
export function useSeenValue(storageKey: string | null, value: string): string | null {
  const [prev, setPrev] = useState<string | null>(null);
  const read = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (storageKey == null) return undefined;
    if (read.current === undefined) {
      let p: string | null = null;
      try {
        p = localStorage.getItem(storageKey);
        localStorage.setItem(storageKey, value);
      } catch {
        // без localStorage — без анімації
      }
      read.current = p;
    }
    const p = read.current;
    if (p == null || p === value) return undefined;
    const raf = requestAnimationFrame(() => setPrev(p));
    return () => cancelAnimationFrame(raf);
  }, [storageKey, value]);
  return prev;
}
