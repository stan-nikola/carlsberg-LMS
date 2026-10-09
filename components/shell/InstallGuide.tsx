"use client";

import { useEffect } from "react";
import { GUIDE_URL } from "@/lib/installGuide";
import { useDismiss } from "@/hooks/useDismiss";

/** «pwa-guide-close» — кнопки Зрозуміло/✕ всередині install.html. */
function useGuideMessage(onDone: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data === "pwa-guide-close") onDone();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [active, onDone]);
}

/**
 * Інструкція на весь екран — крок «guide» онбордингу реєстрації
 * (app/register/page.js): займає весь .course-card, без підкладки/рамки
 * модалки, бо сама Є поточним екраном, а не спливає поверх іншого.
 */
export function InstallGuideEmbed({ onDone }: { onDone: () => void }) {
  // Це сам екран реєстрації, а не оверлей: Esc закриває, але прокрутку не
  // блокуємо.
  useGuideMessage(onDone, true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);
  return <iframe className="install-guide-embed" src={GUIDE_URL} title="Як встановити CarLS на пристрій" />;
}

/**
 * Та сама інструкція в модалці — ручний повторний перегляд із шторки
 * налаштувань (components/shell/SettingsSheet.jsx), поверх поточного екрана.
 */
export function InstallGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useGuideMessage(onClose, open);
  useDismiss(onClose, open);

  if (!open) return null;
  return (
    <div
      className="install-guide-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Як встановити CarLS"
      // Клік по затемненню (не по самій рамці) закриває модалку — той
      // самий паттерн, що й в інших оверлеях проєкту (ImageLightbox,
      // AdminCourseEditor preview). e.target===e.currentTarget: клік по
      // iframe не спливає в батьківський document взагалі (межа фрейма),
      // тож перевірка тут лише для симетрії з рештою оверлеїв.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <iframe className="install-guide-frame" src={GUIDE_URL} title="Як встановити CarLS на пристрій" />
    </div>
  );
}
