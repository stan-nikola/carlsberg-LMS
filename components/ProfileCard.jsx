"use client";

import { useEffect, useState } from "react";
import { initials } from "@/lib/initials";
import { getLocalDisplayName } from "@/lib/localName";

/**
 * Аватар + ім'я + код + рівень (.profile-card, і на Home, і на Профіль).
 * Для співробітників без email (hasEmail=false) підміняє ім'я з БД
 * (заглушка посади/території з імпорту) на те, що людина сама ввела при
 * вході — воно лежить тільки в localStorage цього пристрою, на сервері
 * взагалі не зберігається. Тому це Client Component: на сервері рендериться
 * dbName (SSR), після монтування в браузері підміняється, якщо є локальне
 * значення - без цього довелось би тягнути localStorage на сервер, що
 * неможливо.
 */
export function ProfileCard({ dbName, hasEmail, externalCode, levelLabel }) {
  const [displayName, setDisplayName] = useState(dbName);

  useEffect(() => {
    // Lazy useState-ініціалізатор тут не підходить: цей компонент
    // рендериться і на сервері (SSR), де localStorage відсутній —
    // значення можна прочитати лише в ефекті, після монтування на клієнті.
    if (!hasEmail) {
      const local = getLocalDisplayName();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (local) setDisplayName(local);
    }
  }, [hasEmail]);

  return (
    <div className="profile-card">
      <div className="avatar">{initials(displayName)}</div>
      <div className="profile-info">
        <div className="profile-name">{displayName || "—"}</div>
        <div className="profile-meta">{(externalCode || "").toUpperCase()}</div>
        <div className="profile-level">
          <span className="lv-star">★</span>
          <span>{levelLabel}</span>
        </div>
      </div>
    </div>
  );
}
