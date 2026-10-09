import { PageSkeleton } from "@/components/ui/Skeleton";

/** Власний Suspense-кордон на кожну вкладку /hub: Next.js префетчить усі
 *  вкладки таббару одразу, і без нього префетч тягнув би повний ланцюг
 *  запитів сторінки (рейтинг, бейджі, сертифікати, лідери — ~13 запитів),
 *  навіть якщо людина сюди не перейде. Тут префетч зупиняється, дані —
 *  лише по кліку. */
export default function HubAchievementsLoading() {
  return (
    <section className="hub-screen">
      <PageSkeleton />
    </section>
  );
}
