"use client";

import { ChevronIcon } from "@/components/icons";

/**
 * Спільна логіка/розмітка для конструкторів списків в /admin (варіанти
 * акордеону, пункти чек-листа, репліки скрипта, кроки таймлайна, тепер і
 * страйк-повідомлення) — щоб та сама пара "стрілки вгору/вниз + видалити"
 * не переписувалась у кожному місці окремо.
 */

/** Рядок списку з кнопками "вгору/вниз/видалити". Порядок тут — це
 * порядок, у якому співробітник побачить елементи, тому переставляти
 * треба прямо в конструкторі, а не перебиванням тексту між полями. */
export function ListRowControls({ index, total, onMove, onRemove, label }) {
  return (
    <span className="admin-btn-group">
      <button
        type="button"
        className="admin-icon-btn admin-icon-btn--move"
        onClick={() => onMove(index, -1)}
        disabled={index === 0}
        aria-label={`Підняти ${label}`}
        title="Підняти вище"
      >
        <span className="admin-move-ico is-up" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
      <button
        type="button"
        className="admin-icon-btn admin-icon-btn--move"
        onClick={() => onMove(index, 1)}
        disabled={index === total - 1}
        aria-label={`Опустити ${label}`}
        title="Опустити нижче"
      >
        <span className="admin-move-ico is-down" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
      <button type="button" className="admin-icon-btn" onClick={() => onRemove(index)} aria-label={`Видалити ${label}`} title={`Видалити ${label}`}>
        ✕
      </button>
    </span>
  );
}

/** Спільна логіка list-редакторів: оновити/переставити/видалити/додати. */
export function useListOps(items, onChange) {
  return {
    update: (index, field, value) => onChange(items.map((it, i) => (i === index ? { ...it, [field]: value } : it))),
    move: (index, delta) => {
      const target = index + delta;
      if (target < 0 || target >= items.length) return;
      const next = items.slice();
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
    },
    remove: (index) => onChange(items.filter((_, i) => i !== index)),
    add: (blank) => onChange([...items, blank]),
  };
}
