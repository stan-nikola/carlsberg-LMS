"use client";

import { EmployeeImportForm } from "@/components/EmployeeImportForm";
import { ExcelLivePanel } from "@/components/ExcelLivePanel";

/**
 * /admin/data — усе, що стосується бази як цілого, а не окремої людини:
 * експорт, імпорт, жива Excel-книга. Раніше ці три дії були кнопками в
 * тулбарі /admin/employees поруч із перемикачами вигляду й пошуком — шість
 * рівноправних кнопок без ієрархії. Тепер список співробітників — лише
 * про людей, а робота з даними — окремий пункт сайдбару.
 */
export function AdminDataPage() {
  return (
    <div className="admin-page">
      <div className="adm-page-head">
        <div>
          <h1>Дані</h1>
          <p className="admin-subtitle">Імпорт, експорт і живе підключення Excel до бази.</p>
        </div>
      </div>

      <div className="card-grid adm-data-grid">
        <section className="adm-data-card">
          <h2>Експорт бази</h2>
          <p className="admin-subtitle">
            Повний зріз на момент завантаження: співробітники, курси, призначення, спроби. Разовий файл — для
            звіту чи архіву.
          </p>
          <a className="admin-btn" href="/api/admin/export" style={{ alignSelf: "flex-start" }}>
            ⬇ Завантажити всю базу (.xlsx)
          </a>
        </section>

        <section className="adm-data-card">
          <h2>Імпорт співробітників</h2>
          <EmployeeImportForm />
        </section>
      </div>

      <section className="adm-data-card adm-data-card-wide">
        <h2>Жива Excel-книга</h2>
        {/* Вступ і інструкція — всередині самої панелі, тут не дублюємо. */}
        <ExcelLivePanel />
      </section>
    </div>
  );
}
