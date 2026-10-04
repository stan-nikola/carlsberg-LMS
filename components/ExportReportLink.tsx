"use client";

import { useEffect, useState } from "react";
import { ExcelIcon } from "@/components/icons";

/**
 * «Завантажити звіт» (Excel) — одна кнопка на дашборді, сторінці команди й
 * картці людини (2026-10-05: копіювання в застосунку заборонене, дані —
 * лише цим файлом). Прямий лінк на /api/manager/export — браузер сам
 * завантажує по Content-Disposition. `cards` — увімкнені картки дашборда в
 * його порядку (звіт повторює екран лист у лист); без них — усі листи.
 * iPhone/iPad — через сторінку /manager/report (components/ReportScreen.tsx)
 * з кнопкою «Закрити»: прямий файл у встановленому застосунку відкривався на
 * весь екран без дороги назад. Визначення iOS — лише в ефекті: у серверному
 * рендері navigator нема, і різний href зламав би гідратацію.
 */
export function ExportReportLink({ cards }: { cards?: string[] }) {
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);
  const query = cards ? `?cards=${cards.join(",")}` : "";
  return (
    <a
      className="admin-btn-link mgr-export-link"
      href={`${isIOS ? "/manager/report" : "/api/manager/export"}${query}`}
      title="Завантажити звіт у форматі Excel"
      aria-label="Завантажити звіт у форматі Excel"
    >
      <ExcelIcon /> <span className="mgr-export-label">Завантажити звіт</span>
    </a>
  );
}
