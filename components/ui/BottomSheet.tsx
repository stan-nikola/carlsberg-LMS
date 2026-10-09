"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { useDismiss } from "@/hooks/useDismiss";

type Props = {
  open: boolean;
  onClose: () => void;
  overlayClassName?: string;
  sheetClassName?: string;
  children: ReactNode;
};

/**
 * Нижня шторка: тап поза нею, свайп смужки вниз або Esc — закрити. Прокрутка
 * сторінки під відкритою шторкою заблокована (useDismiss + globals.css).
 */
export function BottomSheet({ open, onClose, overlayClassName = "", sheetClassName = "", children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useDismiss(onClose, open);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);

  function onDown(e: PointerEvent<HTMLDivElement>) {
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    d.dy = Math.max(0, e.clientY - d.y);
    el.style.transform = `translateY(${d.dy}px)`;
  }
  function onUp() {
    const d = drag.current;
    const el = sheetRef.current;
    drag.current = null;
    if (!d || !el) return;
    el.style.transition = "";
    const speed = d.dy / Math.max(1, performance.now() - d.t);
    if (d.dy > el.offsetHeight * 0.25 || (d.dy > 24 && speed > 0.5)) {
      // Доїжджає вниз з того місця, де відпустили, а не стрибає назад.
      el.style.transform = "translateY(100%)";
      onClose();
      setTimeout(() => {
        el.style.transform = "";
      }, 350);
    } else {
      el.style.transform = "";
    }
  }

  return (
    <div
      className={`sheet-overlay${open ? " open" : ""}${overlayClassName ? ` ${overlayClassName}` : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={sheetRef} className={`sheet${sheetClassName ? ` ${sheetClassName}` : ""}`} role="dialog" aria-modal="true">
        <div className="sheet-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="sheet-handle" />
        </div>
        {children}
      </div>
    </div>
  );
}
