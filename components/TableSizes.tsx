"use client";

import { useEffect } from "react";
import { COL, ROW, clamp, parseStore, tableKey, type SizesStore } from "@/lib/tableSizes";

const STORAGE_KEY = "carls_table_sizes_v1";
/** Таблиці з власною реалізацією «як у Excel» (журнал дій, матриця). */
const SKIP = ".audit-grid, .mgr-matrix, [data-no-resize]";
/** Скільки px від межі клітинки ловить ручку: мишею — вузько, пальцем — ширше (палець у 6px не влучає). */
const EDGE = 6;
const TOUCH_EDGE = 16;
/** Подвійний тап по межі — скинути розмір (dblclick на iOS ненадійний). */
const DOUBLE_TAP_MS = 350;

/**
 * Ширина колонок і висота рядків у ВСІХ таблицях застосунку тягнеться
 * мишею, як у Excel (користувач, 2026-10-05): межа заголовка колонки —
 * ширина, нижня межа першої клітинки рядка — висота, подвійний клік по межі
 * — скинути. Розміри — у localStorage цього браузера, окремо для кожної
 * таблиці (lib/tableSizes.ts tableKey).
 *
 * Один компонент у кореневому layout, без правок кожної таблиці: ловить
 * курсор біля межі клітинки (делегування подій на document) і ставить
 * inline width/height — у розмітку таблиць нічого не вставляє, тож React їй
 * не заважає. Палець: зона біля межі ширша (TOUCH_EDGE), а touchstart у ній
 * скасовує скрол сторінки, інакше жест віддавався б прокручуванню. Скинути —
 * подвійний тап по межі.
 */
export function TableSizes() {
  useEffect(() => {
    let store: SizesStore = {};
    try {
      store = parseStore(localStorage.getItem(STORAGE_KEY));
    } catch {
      // заборонене сховище — розміри живуть до перезавантаження
    }
    const save = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      } catch {
        /* не критично */
      }
    };
    const tables = () => [...document.querySelectorAll<HTMLTableElement>("table")].filter((t) => !t.matches(SKIP) && !t.closest(SKIP));
    const headCells = (t: HTMLTableElement) => [...(t.tHead?.rows[0] ?? t.rows[0])?.cells ?? []];
    const keyOf = (t: HTMLTableElement) => tableKey(location.pathname, tables().indexOf(t), headCells(t).map((c) => c.textContent ?? ""));
    const rowKey = (tr: HTMLTableRowElement) => tr.dataset.rowKey ?? String(tr.sectionRowIndex);
    const bodyRows = (t: HTMLTableElement) => [...t.tBodies].flatMap((b) => [...b.rows]);

    /** Природні ширини (без фіксації) → фіксована розкладка з обраними ширинами. */
    function applyCols(t: HTMLTableElement) {
      const cols = store[keyOf(t)]?.cols ?? {};
      const cells = headCells(t);
      t.style.tableLayout = "";
      t.style.width = "";
      cells.forEach((c) => (c.style.width = ""));
      if (!Object.keys(cols).length) {
        t.classList.remove("ts-fixed");
        return;
      }
      const natural = cells.map((c) => c.offsetWidth);
      freeze(t, cells.map((_, i) => cols[i] ?? natural[i]));
    }
    function freeze(t: HTMLTableElement, widths: number[]) {
      headCells(t).forEach((c, i) => (c.style.width = `${widths[i]}px`));
      t.style.width = `${widths.reduce((a, b) => a + b, 0)}px`;
      t.style.tableLayout = "fixed";
      t.classList.add("ts-fixed");
    }
    function applyRows(t: HTMLTableElement) {
      const rows = store[keyOf(t)]?.rows ?? {};
      for (const tr of bodyRows(t)) {
        const h = rows[rowKey(tr)];
        tr.style.height = h ? `${h}px` : "";
      }
    }

    // Нові таблиці (клієнтська навігація, підвантаження) і нові рядки.
    const seen = new WeakMap<HTMLTableElement, string>();
    let raf = 0;
    const scan = () => {
      raf = 0;
      for (const t of tables()) {
        // Прихована таблиця (інша вкладка, мобільний варіант) має нульові
        // ширини — заморозити їх означало б зламати її, щойно вона з’явиться.
        if (!t.offsetWidth) continue;
        const k = keyOf(t);
        if (seen.get(t) !== k) {
          seen.set(t, k);
          applyCols(t);
        }
        applyRows(t);
      }
    };
    const mo = new MutationObserver(() => {
      if (!raf) raf = requestAnimationFrame(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    scan();
    // Фонова вкладка не розкладає сторінку — таблиці мають нульову ширину;
    // збережені розміри докладаємо, коли вкладка знову видима.
    const onVisible = () => document.visibilityState === "visible" && scan();
    document.addEventListener("visibilitychange", onVisible);

    /** Де курсор: біля правої межі заголовка — колонка, біля нижньої межі першої клітинки рядка — рядок. */
    type Zone = { kind: "col" | "row"; t: HTMLTableElement; cell: HTMLTableCellElement };
    const zoneAtPoint = (target: EventTarget | null, x: number, y: number, edge: number): Zone | null => {
      const cell = (target as Element | null)?.closest?.("th, td") as HTMLTableCellElement | null;
      const t = cell?.closest("table") as HTMLTableElement | null;
      if (!cell || !t || !t.offsetWidth || t.matches(SKIP) || t.closest(SKIP)) return null;
      const r = cell.getBoundingClientRect();
      const tr = cell.parentElement as HTMLTableRowElement;
      if (headCells(t).includes(cell) && r.right - x <= edge && r.right - x >= 0) return { kind: "col", t, cell };
      if (cell.cellIndex === 0 && tr.parentElement?.tagName === "TBODY" && r.bottom - y <= edge - 1 && r.bottom - y >= 0) return { kind: "row", t, cell };
      return null;
    };
    const zoneAt = (e: PointerEvent | MouseEvent): Zone | null =>
      zoneAtPoint(e.target, e.clientX, e.clientY, "pointerType" in e && e.pointerType === "touch" ? TOUCH_EDGE : EDGE);
    const mouse = (e: PointerEvent) => e.pointerType === "mouse" || e.pointerType === "pen";

    const onMove = (e: PointerEvent) => {
      if (!mouse(e) || drag) return;
      const z = zoneAt(e);
      const want = z ? z.kind : "";
      if ((document.documentElement.dataset.tsCursor ?? "") !== want) {
        if (want) document.documentElement.dataset.tsCursor = want;
        else delete document.documentElement.dataset.tsCursor;
      }
    };

    let drag: null | { z: Zone; start: number; origin: number; widths?: number[]; idx: number } = null;
    let lastTap: { at: number; cell: HTMLTableCellElement; kind: string } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const z = zoneAt(e);
      if (!z) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType === "touch") {
        const now = performance.now();
        if (lastTap && lastTap.cell === z.cell && lastTap.kind === z.kind && now - lastTap.at < DOUBLE_TAP_MS) {
          lastTap = null;
          resetZone(z);
          return;
        }
        lastTap = { at: now, cell: z.cell, kind: z.kind };
      }
      if (z.kind === "col") {
        const cells = headCells(z.t);
        const widths = cells.map((c) => c.offsetWidth);
        freeze(z.t, widths);
        const idx = cells.indexOf(z.cell);
        drag = { z, start: widths[idx], origin: e.clientX, widths, idx };
      } else {
        const tr = z.cell.parentElement as HTMLTableRowElement;
        drag = { z, start: tr.offsetHeight, origin: e.clientY, idx: 0 };
      }
      document.documentElement.dataset.tsDragging = z.kind;
      window.addEventListener("pointermove", onDrag);
      window.addEventListener("pointerup", onUp, { once: true });
      window.addEventListener("pointercancel", onUp, { once: true });
    };
    const onDrag = (e: PointerEvent) => {
      if (!drag) return;
      const { z } = drag;
      if (z.kind === "col" && drag.widths) {
        drag.widths[drag.idx] = clamp(drag.start + e.clientX - drag.origin, COL);
        freeze(z.t, drag.widths);
      } else {
        (z.cell.parentElement as HTMLTableRowElement).style.height = `${clamp(drag.start + e.clientY - drag.origin, ROW)}px`;
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onDrag);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      delete document.documentElement.dataset.tsDragging;
      if (!drag) return;
      const { z } = drag;
      const k = keyOf(z.t);
      const s = (store[k] ??= { cols: {}, rows: {} });
      if (z.kind === "col" && drag.widths) s.cols[drag.idx] = drag.widths[drag.idx];
      else {
        const tr = z.cell.parentElement as HTMLTableRowElement;
        s.rows[rowKey(tr)] = tr.offsetHeight;
      }
      save();
      drag = null;
      // Відпускання над рядком-кнопкою не має відкривати картку.
      const stop = (ev: Event) => ev.stopPropagation();
      window.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
    };
    function resetZone(z: Zone) {
      const s = store[keyOf(z.t)];
      if (!s) return;
      if (z.kind === "col") {
        delete s.cols[headCells(z.t).indexOf(z.cell)];
        applyCols(z.t);
      } else {
        delete s.rows[rowKey(z.cell.parentElement as HTMLTableRowElement)];
        applyRows(z.t);
      }
      save();
    }
    const onDbl = (e: MouseEvent) => {
      const z = zoneAt(e);
      if (!z) return;
      e.preventDefault();
      e.stopPropagation();
      resetZone(z);
    };
    // Палець біля межі: скасовуємо скрол, інакше браузер забирає жест (pointercancel).
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length === 1 && t && zoneAtPoint(e.target, t.clientX, t.clientY, TOUCH_EDGE)) e.preventDefault();
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("dblclick", onDbl, true);
    document.addEventListener("touchstart", onTouchStart, { passive: false, capture: true });
    return () => {
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("dblclick", onDbl, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("pointermove", onDrag);
    };
  }, []);
  return null;
}
