"use client";

import { useViewData } from "@/components/useViewData";
import { AchievementsPanel } from "@/components/AchievementsPanel";
import { PageSkeleton } from "@/components/Skeleton";

// eslint не забороняє any в цьому проєкті — але типізувати повну форму
// відповіді (rating+badges+certificates+leaderboard) сюди ще не варто,
// доки ці lib-функції самі лишаються .js без експортованих типів.
type AchievementsData = any;

async function fetchAchievements(): Promise<AchievementsData> {
  const res = await fetch("/api/manager/achievements");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

// Той самий вміст, що app/manager/achievements/page.js — клієнтська версія
// для перемикання вкладки без реальної Next.js-навігації (ManagerShell.jsx).
export function AchievementsView() {
  const { data, loading, error } = useViewData("/manager/achievements", fetchAchievements);

  if (loading) {
    return (
      <div className="manager-page manager-achievements-page">
        <PageSkeleton />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="manager-page manager-achievements-page">
        <p className="admin-hint">Не вдалося завантажити досягнення. Спробуйте оновити сторінку.</p>
      </div>
    );
  }

  return (
    <div className="manager-page manager-achievements-page">
      <div className="greeting">ВАШ ПРОГРЕС</div>
      <h1 className="hub-h1">Досягнення</h1>
      <AchievementsPanel
        rating={data.rating}
        badges={data.badges}
        certificates={data.certificates}
        leaderboard={data.leaderboard}
        leaderboardTitle="Лідери вашої команди (% від найкращого у своїй посаді)"
        cohortLabel={data.cohortLabel}
        currentEmployeeId={data.currentEmployeeId}
        hasEmail={data.hasEmail}
      />
    </div>
  );
}
