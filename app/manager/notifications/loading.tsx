import { PageSkeleton } from "@/components/Skeleton";

/** Власний Suspense-кордон для /manager/notifications — див.
 *  app/manager/achievements/loading.tsx (той самий аудит швидкодії,
 *  2026-09-19): дзвіночок у сайдбарі/appbar теж &lt;Link&gt;, теж підпадав
 *  під автопрефетч усього видимого. */
export default function ManagerNotificationsLoading() {
  return (
    <div className="admin-page manager-page">
      <PageSkeleton />
    </div>
  );
}
