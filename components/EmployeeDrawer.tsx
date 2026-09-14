"use client";

import { useEffect } from "react";
import Link from "next/link";
import { XIcon } from "@/components/icons";
import { EmployeeDetail } from "@/components/EmployeeDetail";

type Props = {
  employeeId: number;
  onClose: () => void;
  /** Картку змінили (зберегли/деактивували) — список за нею має оновитись. */
  onChanged?: (updated: unknown) => void;
};

/**
 * Картка співробітника бічною панеллю поверх списку /admin/employees.
 * Список, пошук і фільтри лишаються на місці — переглянути десятьох підряд
 * можна без «назад → знайти знову». Та сама EmployeeDetail, що й на
 * окремій сторінці /admin/employees/[id] (вона теж лишається: прямі
 * посилання з дерева й з картки керівника ведуть туди).
 */
export function EmployeeDrawer({ employeeId, onClose, onChanged }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Поки панель відкрита — сторінка під нею не скролиться.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="adm-drawer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="adm-drawer" role="dialog" aria-modal="true" aria-label="Картка співробітника">
        <div className="adm-drawer-bar">
          <Link href={`/admin/employees/${employeeId}`} className="admin-btn-link">
            Відкрити окремою сторінкою ↗
          </Link>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Закрити" title="Закрити (Esc)">
            <XIcon />
          </button>
        </div>
        <EmployeeDetail employeeId={employeeId} compact onChanged={onChanged} />
      </aside>
    </div>
  );
}
