import { PageSkeleton } from "@/components/Skeleton";

/** Власний Suspense-кордон для /manager/achievements (аудит швидкодії,
 *  2026-09-19): раніше на весь розділ /manager був лише один спільний
 *  app/manager/loading.tsx, і Next.js префетчив УСІ вкладки сайдбара/
 *  таббара одразу при відкритті /manager — без власного loading.js
 *  префетч кожної вкладки не мав де зупинитись і одразу тягнув повний
 *  ланцюг запитів (тут — найважчий: лідерборд по регіону, ~16 запитів),
 *  навіть якщо людина туди так і не заходить. Той самий каркас, що
 *  ManagerLoading (app/manager/loading.tsx) — `admin-page manager-page`
 *  обов'язково разом, інакше скелетон не на повну висоту вьюпорту. */
export default function ManagerAchievementsLoading() {
  return (
    <div className="admin-page manager-page">
      <PageSkeleton />
    </div>
  );
}
