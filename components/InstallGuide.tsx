"use client";

import { useEffect } from "react";
import { GUIDE_URL } from "@/lib/installGuide";

/** «pwa-guide-close» (кнопки Зрозуміло/✕ всередині install.html) або
 *  Escape — спільний сигнал для обох способів показу інструкції нижче.
 *  active=false (закрита модалка) — слухачі не висять даремно й Escape
 *  десь-інде на сторінці не закриває те, що й так закрите. */
function useGuideCloseSignal(onDone: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data === "pwa-guide-close") onDone();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, onDone]);
}

/**
 * Інструкція на весь екран — крок «guide» онбордингу реєстрації
 * (app/register/page.js): займає весь .course-card, без підкладки/рамки
 * модалки, бо сама Є поточним екраном, а не спливає поверх іншого.
 */
export function InstallGuideEmbed({ onDone }: { onDone: () => void }) {
  useGuideCloseSignal(onDone, true);
  return <iframe className="install-guide-embed" src={GUIDE_URL} title="Як встановити CarLS на пристрій" />;
}

/**
 * Та сама інструкція в модалці — ручний повторний перегляд із шторки
 * налаштувань (components/SettingsSheet.jsx), поверх поточного екрана.
 */
export function InstallGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useGuideCloseSignal(onClose, open);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="install-guide-overlay" role="dialog" aria-modal="true" aria-label="Як встановити CarLS">
      <iframe className="install-guide-frame" src={GUIDE_URL} title="Як встановити CarLS на пристрій" />
    </div>
  );
}
