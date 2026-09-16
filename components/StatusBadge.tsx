import type { ReactNode } from "react";
import { CheckIcon, XIcon } from "@/components/icons";

/**
 * Єдиний статус «Складено / Не складено» для хаба, кабінету керівника й
 * адмінки (до 2026-09-16 було три різні верстки: .mgr-pill, .mgr-attempt-*,
 * .ct-status-done). Форма — токен --radius-badge, стилі — .status-pill у
 * app/globals.css. children — власний підпис («Залік · 92%»).
 */
export function StatusBadge({ passed, icon = false, children }: { passed: boolean; icon?: boolean; children?: ReactNode }) {
  return (
    <span className={`status-pill ${passed ? "status-pill-success" : "status-pill-fail"}`}>
      {icon && (passed ? <CheckIcon /> : <XIcon />)}
      {children ?? (passed ? "Складено" : "Не складено")}
    </span>
  );
}
