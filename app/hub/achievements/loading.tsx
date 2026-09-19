import { PageSkeleton } from "@/components/Skeleton";

/** Власний Suspense-кордон для /hub/achievements (аудит швидкодії,
 *  2026-09-19): раніше на весь розділ /hub був лише один спільний
 *  app/hub/loading.tsx, і Next.js префетчив КОЖНУ вкладку таббару одразу
 *  при відкритті /hub (усі лінки в зоні видимості) — без власного
 *  loading.js префетч не мав де зупинитись і одразу тягнув повний ланцюг
 *  запитів сторінки (рейтинг+бейджі+сертифікати+лідери, ~13 запитів),
 *  навіть якщо людина на цю вкладку так і не тисне. Окремий файл на
 *  кожен екран — префетч зупиняється тут, реальні дані вантажаться лише
 *  по кліку. */
export default function HubAchievementsLoading() {
  return (
    <section className="hub-screen">
      <PageSkeleton />
    </section>
  );
}
