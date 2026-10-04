"use client";

import { useEffect } from "react";

/** Поля, де виділення, копіювання й вставка лишаються: PIN із листа, пошук, тексти в конструкторі. */
const EDITABLE = "input, textarea, select, [contenteditable=''], [contenteditable='true']";
const inField = (e: Event) => !!(e.target as Element | null)?.closest?.(EDITABLE);

/**
 * Заборона копіювання по всьому застосунку (користувач, 2026-10-05):
 * виділення вимкнено в CSS (globals.css, body user-select), тут — копіювання,
 * вирізання, контекстне меню й перетягування картинок поза полями вводу.
 * Дані, які справді потрібні (таблиці команди, звіт), — кнопкою
 * «Завантажити звіт» у Excel. Кнопки «Скопіювати» (токен Power Query, :root
 * на стенді) працюють: navigator.clipboard ці події не викликає.
 */
export function CopyGuard() {
  useEffect(() => {
    const block = (e: Event) => {
      if (!inField(e)) e.preventDefault();
    };
    const events = ["copy", "cut", "contextmenu", "dragstart"] as const;
    for (const t of events) document.addEventListener(t, block, true);
    return () => {
      for (const t of events) document.removeEventListener(t, block, true);
    };
  }, []);
  return null;
}
