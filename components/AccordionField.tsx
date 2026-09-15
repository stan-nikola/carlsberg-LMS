"use client";

import { useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/icons";

/**
 * Згортана секція форми з шевроном — «За посадами», «За територіями» у
 * призначенні курсу (AdminDashboard.jsx) і в масовій видачі відзнаки
 * (AdminBadges.jsx). Згорнута показує короткий підсумок вибору.
 */
export function AccordionField({
  title,
  summary,
  children,
  footer,
  defaultOpen = false,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  footer?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`admin-field admin-target-card${open ? " admin-target-card-open" : ""}`}>
      <div
        className="admin-accordion-header admin-territory-accordion-header"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <span className={`territory-caret${open ? " territory-caret-open" : ""}`}>
          <ChevronIcon />
        </span>
        <span className="admin-label" style={{ marginBottom: 0 }}>
          {title}
        </span>
        {!open && summary && <span className="admin-hint admin-accordion-summary">{summary}</span>}
      </div>
      {open && (
        <div className="admin-accordion-body" style={{ paddingLeft: 0, paddingTop: 10 }}>
          {children}
          {footer && (
            <p className="admin-hint" style={{ marginTop: 6 }}>
              {footer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
