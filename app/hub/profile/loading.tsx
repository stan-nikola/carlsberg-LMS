import { PageSkeleton } from "@/components/Skeleton";

/** Власний Suspense-кордон для /hub/profile — див. app/hub/achievements/loading.tsx
 *  (той самий аудит швидкодії, 2026-09-19). */
export default function HubProfileLoading() {
  return (
    <section className="hub-screen">
      <PageSkeleton />
    </section>
  );
}
