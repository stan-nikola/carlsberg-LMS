"use client";

import { useEffect, useState } from "react";
import { SettingsGearIcon, LogoutIcon } from "@/components/icons";

// Портовано з legacy/js/settings.js — той самий ключ localStorage, щоб
// налаштування розміру шрифту не губились для існуючих користувачів.
const FS_SCALES = [1, 1.15, 1.3, 1.45];
const FS_STORAGE_KEY = "telesale_fs_step";

/**
 * Шторка налаштувань (розмір тексту) + опційно вихід з акаунту. Відкриття/
 * закриття контролюється ззовні (кнопка-шестерня живе в appbar сторінки,
 * яка й тримає open-state).
 */
export function SettingsSheet({ open, onClose, onLogout }) {
  const [fsStep, setFsStep] = useState(0);

  useEffect(() => {
    let saved = 0;
    try {
      const raw = parseInt(localStorage.getItem(FS_STORAGE_KEY), 10);
      if (!Number.isNaN(raw) && raw >= 0 && raw <= 3) saved = raw;
    } catch {
      // localStorage недоступний (приватний режим тощо) — лишаємось на 0
    }
    // Читаємо localStorage один раз при монтуванні — lazy useState-ініціалізатор
    // тут не підходить: цей компонент рендериться і на сервері (SSR), де
    // localStorage/document відсутні, тож значення можна прочитати лише в
    // ефекті, після монтування на клієнті.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFsStep(saved);
    document.documentElement.style.setProperty("--fs-scale", String(FS_SCALES[saved]));
  }, []);

  function handleSliderChange(event) {
    const step = parseInt(event.target.value, 10) || 0;
    setFsStep(step);
    document.documentElement.style.setProperty("--fs-scale", String(FS_SCALES[step]));
    try {
      localStorage.setItem(FS_STORAGE_KEY, String(step));
    } catch {
      // ігноруємо — розмір шрифту просто не запам'ятається між сесіями
    }
  }

  return (
    <div
      className={`sheet-overlay${open ? " open" : ""}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <div className="sheet-handle" />
        <h3>Налаштування</h3>
        <p className="lead">Підлаштуйте розмір тексту під себе.</p>
        <div className="settings-block">
          <div className="settings-row">
            <div className="settings-label">
              <span className="settings-ico">
                <SettingsGearIcon />
              </span>
              <div>
                <div className="settings-t">Розмір тексту</div>
                <div className="settings-d">Збільшіть шрифт, якщо текст замалий</div>
              </div>
            </div>
            <div className="fs-slider-wrap">
              <span className="fs-a">A</span>
              <input
                id="fsSlider"
                type="range"
                min="0"
                max="3"
                step="1"
                value={fsStep}
                onChange={handleSliderChange}
                aria-label="Розмір тексту"
              />
              <span className="fs-a big">A</span>
            </div>
          </div>
        </div>
        <p className="footnote">
          Налаштування зберігаються лише на цьому пристрої й не впливають на результат тесту.
        </p>

        {onLogout && (
          <button className="logout-row" onClick={onLogout}>
            <LogoutIcon />
            <span>Вийти з акаунту</span>
          </button>
        )}
      </div>
    </div>
  );
}
