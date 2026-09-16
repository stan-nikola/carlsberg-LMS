import { PageSkeleton } from "@/components/Skeleton";

/** Те саме для вкладок /hub: таббар лишається, екран — скелетон. */
export default function HubLoading() {
  return (
    <section className="hub-screen">
      <PageSkeleton />
    </section>
  );
}
