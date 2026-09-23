import { PageSkeleton } from "@/components/Skeleton";

/** Те саме, що app/manager/loading.tsx — каркас лишається, контент скелетоном. */
export default function ManagerTeamLoading() {
  return (
    <div className="admin-page manager-page">
      <PageSkeleton />
    </div>
  );
}
