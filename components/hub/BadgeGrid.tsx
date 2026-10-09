"use client";

import { useEffect, useRef } from "react";
import type { BadgeView } from "@/lib/achievements";

/**
 * Сітка відзнак — окремий client-компонент (AchievementsPanel.jsx лишається
 * серверним), бо конкретна відзнака може прийти зі сповіщення "Нова
 * відзнака" (?highlight=badge&badgeId=N, lib/notifications.js) і має
 * підсвітитись/проскролитись у полі зору — той самий прийом, що й
 * .rt-card-highlight на картці рейтингу (rating.css): один спалах, що сам
 * гасне.
 */
export function BadgeGrid({ badges, highlightBadgeId = null }: { badges: BadgeView[]; highlightBadgeId?: number | null }) {
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightBadgeId != null) highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightBadgeId]);

  if (badges.length === 0) return <p className="hub-empty-note">Відзнак поки не заведено.</p>;

  return (
    <div className="badge-grid">
      {badges.map((b) => {
        const isTarget = b.id === highlightBadgeId;
        return (
          <div key={b.id} className={`badge-item${b.earned ? "" : " locked"}`} title={b.description || ""}>
            <div className={`badge-ico${isTarget ? " badge-highlight" : ""}`} ref={isTarget ? highlightRef : undefined}>
              {b.icon || "⭐"}
            </div>
            <span>{b.title}</span>
            {b.points > 0 && <span className="badge-points">+{b.points}</span>}
          </div>
        );
      })}
    </div>
  );
}
