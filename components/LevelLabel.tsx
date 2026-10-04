"use client";

import { useEffect, useState } from "react";
import { useSeenValue } from "@/lib/useSeenValue";

/** Момент підміни назви — середина руху (0.65s затримки + половина з 1.3s), як на стенді. */
const SWAP_MS = (0.65 + 1.3 * 0.5) * 1000;

/**
 * «Рівень: Профі» з анімацією нового рівня (стенд Motion Tuner «A»,
 * 2026-10-04): рівень порівнюється з тим, що бачили на цьому пристрої
 * востаннє (`useSeenValue`). Змінився — зірка обертається, стара назва
 * гасне й зʼявляється нова, від плашки розходяться два кільця.
 */
export function LevelLabel({ label, storageKey }: { label: string; storageKey: string }) {
  const prev = useSeenValue(storageKey, label);
  const [swapped, setSwapped] = useState(false);
  useEffect(() => {
    if (prev == null) return undefined;
    const t = setTimeout(() => setSwapped(true), SWAP_MS);
    return () => clearTimeout(t);
  }, [prev]);
  const shown = prev != null && !swapped ? prev : label;
  return (
    <span className={`rt-level-pill${prev != null ? " is-levelup" : ""}`}>
      <span className="lv-star">★</span> Рівень: <span className="rt-level-name">{shown}</span>
    </span>
  );
}
