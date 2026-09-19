import { PageSkeleton } from "@/components/Skeleton";

/** Власний Suspense-кордон для /manager/courses — див.
 *  app/manager/achievements/loading.tsx (той самий аудит швидкодії,
 *  2026-09-19). */
export default function ManagerCoursesLoading() {
  return (
    <div className="admin-page manager-page">
      <PageSkeleton />
    </div>
  );
}
