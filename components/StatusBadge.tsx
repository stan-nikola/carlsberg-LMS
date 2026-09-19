import type { ReactNode } from "react";
import { MorphRevealIcon } from "@/components/MorphRevealIcon";

/**
 * Єдиний статус «Складено / Не складено» для хаба, кабінету керівника й
 * адмінки (до 2026-09-16 було три різні верстки: .mgr-pill, .mgr-attempt-*,
 * .ct-status-done). Форма — токен --radius-badge, стилі — .status-pill у
 * app/globals.css. children — власний підпис («Залік · 92%»).
 * Іконка — морф-анімація появи (MorphRevealIcon, запит користувача,
 * 2026-09-19: той самий "трофей" ✓/✗, що демонструвався в артефакті),
 * не статичні Check/XIcon — грає при кожному монтуванні картки.
 */
export function StatusBadge({ passed, icon = false, children }: { passed: boolean; icon?: boolean; children?: ReactNode }) {
  return (
    <span className={`status-pill ${passed ? "status-pill-success" : "status-pill-fail"}`}>
      {icon && <MorphRevealIcon shape={passed ? "check" : "x"} label={passed ? "Складено" : "Не складено"} size={12} strokeWidth={2.4} />}
      {children ?? (passed ? "Складено" : "Не складено")}
    </span>
  );
}
