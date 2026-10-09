"use client";

import { useSeenValue } from "@/hooks/useSeenValue";
import { pluralWord } from "@/lib/pluralize";

/**
 * «↑ 2 місця з минулого разу» (стенд Motion Tuner «J», 2026-10-04): місце
 * порівнюється з тим, що бачили на цьому пристрої востаннє (`useSeenValue`).
 * Піднялись — зелений чип із стрибучою стрілкою; опустились — спокійний сірий
 * без стрибків (не карати рухом). Без змін або перший візит — нічого.
 */
function places(n: number) {
  return pluralWord(n, "місце", "місця", "місць");
}

export function RankDelta({ rank, storageKey }: { rank: number; storageKey: string }) {
  const prev = useSeenValue(storageKey, String(rank));
  const delta = prev == null ? 0 : Number(prev) - rank;
  if (!Number.isFinite(delta) || delta === 0) return null;
  const up = delta > 0;
  return (
    <span className={`rt-rank-delta${up ? " is-up" : " is-down"}`}>
      <span className="rt-rank-delta-arrow" aria-hidden="true">
        {up ? "↑" : "↓"}
      </span>
      {Math.abs(delta)} {places(delta)} з минулого разу
    </span>
  );
}
