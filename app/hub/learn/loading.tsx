import { PageSkeleton } from "@/components/Skeleton";

/** Власний Suspense-кордон для /hub/learn — див. app/hub/achievements/loading.tsx
 *  (той самий аудит швидкодії, 2026-09-19): без нього префетч цієї
 *  вкладки тягнув повний getEmployeeEnrollments() ще до кліку. */
export default function HubLearnLoading() {
  return (
    <section className="hub-screen">
      <PageSkeleton />
    </section>
  );
}
