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
    <div className="admin-page adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Дані</h1>
          <p className="admin-subtitle">Імпорт, експорт і живе підключення Excel до бази.</p>
        </div>
      </div>

      {/* Разові дії (експорт/імпорт) — поруч у першому ряду, жива книга з
          інструкцією й таблицею токенів — на всю ширину під ними. */}
      <div className="adm-flow">
        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Експорт бази</h2>
          </div>
          <p className="admin-subtitle">
            Повний зріз на момент завантаження: співробітники, курси, призначення, спроби. Разовий файл — для
            звіту чи архіву.
          </p>
          <div className="adm-card-foot">
            <a className="admin-btn" href="/api/admin/export">
              ⬇ Завантажити всю базу (.xlsx)
            </a>
          </div>
        </section>

        <section className="adm-card">
          <div className="adm-card-head">
            <h2>Імпорт співробітників</h2>
          </div>
          <EmployeeImportForm />
        </section>

        <section className="adm-card adm-full">
          <div className="adm-card-head">
            <h2>Жива Excel-книга</h2>
          </div>
          {/* Вступ і інструкція — всередині самої панелі, тут не дублюємо. */}
          <ExcelLivePanel />
        </section>
      </div>
    </div>
  );
}
