"use client";

import { useEffect, useRef, useState } from "react";
import { XIcon } from "@/components/icons";

/**
 * Плаваюче вікно — перетягується за заголовок, змінює розмір за нижній-
 * правий кут, БЕЗ фонового оверлею (сторінка позаду лишається видною й
 * клікабельною) і БЕЗ блокування скролу body (перший такий компонент у
 * проєкті — модальних вікон тут досі не було, "Модальних вікон у проєкті
 * взагалі нема" зафіксовано в CLAUDE.md; це свідомо НЕ модалка, а окреме
 * плаваюче вікно поверх сторінки).
 *
 * Позиція/розмір лише в React state цього монтування — не зберігаються
 * між відкриттями (проста версія, рішення користувача 2026-09-19).
 *
 * Один listener на mousemove/mouseup, живий увесь час, поки вікно
 * змонтоване — а не додається/знімається на кожен жест drag/resize
 * окремо: так не треба ганятись за стабільністю ідентичності обробника
 * між рендерами (setPos/setSize під час руху миші й так перемальовують
 * компонент). dragRef/resizeRef лише позначають, який саме жест зараз
 * триває (або жоден).
 */
export function FloatingWindow({
  title,
  onClose,
  children,
  defaultWidth = 860,
  defaultHeight = 580,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight });
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (drag) {
        setPos({ x: drag.startPosX + (e.clientX - drag.startX), y: drag.startPosY + (e.clientY - drag.startY) });
      }
      const resize = resizeRef.current;
      if (resize) {
        setSize({
          width: Math.max(420, resize.startW + (e.clientX - resize.startX)),
          height: Math.max(280, resize.startH + (e.clientY - resize.startY)),
        });
      }
    }
    function handleUp() {
      dragRef.current = null;
      resizeRef.current = null;
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function onHeaderMouseDown(e: React.MouseEvent) {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: rect.left, startPosY: rect.top };
  }
  function onHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.width, startH: size.height };
  }

  return (
    <div
      ref={rootRef}
      className="floating-window"
      style={
        pos
          ? { left: pos.x, top: pos.y, width: size.width, height: size.height }
          : { left: "50%", top: 72, transform: "translateX(-50%)", width: size.width, height: size.height }
      }
      role="dialog"
      aria-label={title}
    >
      <div className="floating-window-header" onMouseDown={onHeaderMouseDown}>
        <span className="floating-window-title">{title}</span>
        <button type="button" className="floating-window-close" onClick={onClose} aria-label="Закрити">
          <XIcon />
        </button>
      </div>
      <div className="floating-window-body">{children}</div>
      <div className="floating-window-handle" onMouseDown={onHandleMouseDown} aria-hidden="true" />
    </div>
  );
}
