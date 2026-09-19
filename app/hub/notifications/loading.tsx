import { PageSkeleton } from "@/components/Skeleton";

/** Власний Suspense-кордон для /hub/notifications — див.
 *  app/hub/achievements/loading.tsx (той самий аудит швидкодії,
 *  2026-09-19): дзвіночок в appbar теж &lt;Link&gt;, тож теж підпадав під
 *  автопрефетч усього видимого. */
export default function HubNotificationsLoading() {
  return (
    <section className="hub-screen">
      <PageSkeleton />
    </section>
  );
}
