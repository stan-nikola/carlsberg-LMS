"use client";

import { createContext, useContext, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { HintDot } from "@/components/ui/HintDot";

/** Режим перестановки карток: картки хитаються (manager.css .is-editable). */
export const DashboardEditContext = createContext(false);

/** Картка дашборда: рамка, заголовок з іконкою, примітка й «ⓘ» з поясненням. */
export function ChartCard({
  icon,
  title,
  note,
  hint,
  className,
  cardRef,
  children,
}: {
  icon: ReactNode;
  title: string;
  /** Дрібний підпис поруч із назвою. */
  note?: ReactNode;
  /** Що саме рахує картка — показується по ховеру «ⓘ». */
  hint: string;
  className?: string;
  cardRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const editable = useContext(DashboardEditContext);
  return (
    <div className={`mgr-chart-card${className ? ` ${className}` : ""}${editable ? " is-editable" : ""}`} ref={cardRef}>
      <h2>
        {icon} <span className="mgr-card-title">{title}</span>
        {note != null && <span className="admin-hint mgr-card-note">{note}</span>}
        <HintDot text={hint} />
      </h2>
      {children}
    </div>
  );
}

/**
 * Рядок-смуга списку картки: підпис, смуга, значення. З href увесь рядок —
 * посилання на список за тим самим критерієм. pct — уже з урахуванням того,
 * чи грає анімація заповнення (0, поки картка не з'явилась на екрані).
 */
export function BarRow({
  href,
  label,
  stacked = false,
  pct,
  alert = false,
  value,
}: {
  href?: string;
  label: ReactNode;
  /** Назва й підписи під нею кількома рядками (.mgr-bar-label-stack). */
  stacked?: boolean;
  pct: number;
  alert?: boolean;
  value: ReactNode;
}) {
  const inner = (
    <>
      <span className={`mgr-bar-label${stacked ? " mgr-bar-label-stack" : ""}`}>{label}</span>
      <div className="mgr-bar-track">
        <div className={`mgr-bar-fill${alert ? " mgr-bar-fill-alert" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="mgr-bar-value">{value}</span>
    </>
  );
  if (!href) return <li className="mgr-bar-row">{inner}</li>;
  return (
    <li>
      <Link href={href} className="mgr-bar-row mgr-card-link">
        {inner}
      </Link>
    </li>
  );
}
