"use client";

import { useViewData } from "@/components/useViewData";
import { ManagerDashboard } from "@/components/ManagerDashboard";
import { PageSkeleton } from "@/components/Skeleton";

async function fetchOverview() {
  const res = await fetch("/api/manager/overview");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

export function TeamView() {
  const { data, loading, error } = useViewData("/manager", fetchOverview);
  if (loading) {
    return (
      <div className="admin-page manager-page">
        <PageSkeleton />
      </div>
    );
  }
  return <ManagerDashboard initialData={error ? null : data} initialError={error} />;
}
