"use client";

import { createPortal } from "react-dom";
import { XIcon } from "@/components/icons";

/**
 * Каталог карток-діаграм дашборда /manager (components/ManagerDashboard.jsx)
 * — єдине джерело правди для: (1) чекбоксів у цій шторці, (2) того, які
 * картки увімкнені за замовчуванням.
 *
 * group — лише орієнтир для угруповання чекбоксів по типовій ролі
 * ("що зазвичай цікавить СВ/АСМ/T&D"), а НЕ обмеження доступу: будь-який
 * керівник бачить усі три групи й може увімкнути будь-яку картку з будь-
 * якої (2026-09-19, рішення користувача — "суть в том что каждый может
 * добавить интересующий его график аналитику").
 *
 * "sv"/"asm"/"td" — розсортовано по тому, наскільки деталь дивиться
 * "у людину" (СВ, щодня) чи "у контент/тренд по всій зоні" (T&D).
 */
export const DASHBOARD_CARDS = [
  { id: "rings", label: "Показники команди (кільця)", group: "sv" },
  { id: "deadlines", label: "Дедлайни на горизонті", group: "sv" },
  { id: "scoreDist", label: "Розподіл балів", group: "sv" },
  { id: "hardestModules", label: "Найскладніші модулі", group: "td" },
  { id: "peopleStatus", label: "Матриця: люди × курси", group: "sv" },
  { id: "trend", label: "Активність по тижнях", group: "asm" },
  { id: "courseBreakdown", label: "% складання по курсу", group: "asm" },
  { id: "teamCompare", label: "Порівняння команд", group: "asm" },
  { id: "firstTry", label: "З першої спроби", group: "td" },
  { id: "duration", label: "Час на проходження", group: "td" },
  { id: "hardestQuestions", label: "Найскладніші питання", group: "td" },
];

const GROUP_META = {
  sv: { title: "Важливо для СВ", hint: "Погляд по людях — кого підтягнути, що саме не виходить." },
  asm: { title: "Важливо для АСМ", hint: "Порівняння команд і трендів, не окремих людей." },
  td: { title: "Важливо для T&D", hint: "Якість контенту — де курс чи питання плутають людей." },
};
const GROUP_ORDER = ["sv", "asm", "td"];

export function ManagerDashboardSettings({ enabled, onToggle, onClose, onResetLayout }) {
  return createPortal(
    <div className="mgr-drawer-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mgr-drawer" role="dialog" aria-modal="true" aria-label="Налаштування діаграм дашборда">
        <div className="mgr-drawer-head">
          <h2>Картки дашборда</h2>
          <button type="button" className="iconbtn iconbtn-bare" onClick={onClose} aria-label="Закрити">
            <XIcon />
          </button>
        </div>
        <p className="admin-hint mgr-drawer-intro">
          Групи нижче — просто підказка, що зазвичай цікаво тій чи іншій ролі. Вмикайте будь-яку картку незалежно
          від групи — дашборд запам&apos;ятає вибір у цьому браузері.
        </p>

        {GROUP_ORDER.map((group) => (
          <div className="mgr-drawer-group" key={group}>
            <div className="mgr-drawer-group-title">{GROUP_META[group].title}</div>
            <p className="admin-hint mgr-drawer-group-hint">{GROUP_META[group].hint}</p>
            <ul className="mgr-drawer-checklist">
              {DASHBOARD_CARDS.filter((c) => c.group === group).map((card) => (
                <li key={card.id}>
                  <label className="mgr-drawer-checkbox-row">
                    <input type="checkbox" checked={enabled.has(card.id)} onChange={() => onToggle(card.id)} />
                    <span>{card.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Скидання стосується лише РОЗКЛАДКИ (порядок, ширини, висоти) —
            галочки видимості вище лишаються як є: це різні рішення, і
            зносити їх разом було б несподіванкою. */}
        <button type="button" className="admin-btn-link mgr-drawer-reset" onClick={onResetLayout}>
          Скинути розкладку
        </button>
        <p className="admin-hint mgr-drawer-group-hint">
          Поверне порядок, ширину й висоту карток до початкових. Перелік увімкнених карток не зміниться.
        </p>
      </div>
    </div>,
    document.body
  );
}
