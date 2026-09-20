"use client";

import { useViewData } from "@/components/useViewData";
import { ProfileCard } from "@/components/ProfileCard";
import { ProfileDetailPanel } from "@/components/ProfileDetailPanel";
import { NotificationSettings } from "@/components/NotificationSettings";
import { PageSkeleton } from "@/components/Skeleton";

type ProfileData = {
  dbName: string;
  hasEmail: boolean;
  externalCode: string;
  levelLabel: string;
  avatarUrl: string | null;
  managerEmail: string | null;
  firstLoginAt: string | null;
};

async function fetchProfile(): Promise<ProfileData> {
  const res = await fetch("/api/manager/profile");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

// Той самий вміст, що app/manager/profile/page.js — клієнтська версія для
// перемикання вкладки без реальної Next.js-навігації (ManagerShell.jsx).
export function ProfileView() {
  const { data, loading, error } = useViewData("/manager/profile", fetchProfile);

  if (loading) {
    return (
      <div className="manager-page manager-profile-page">
        <PageSkeleton />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="manager-page manager-profile-page">
        <p className="admin-hint">Не вдалося завантажити профіль. Спробуйте оновити сторінку.</p>
      </div>
    );
  }

  return (
    <div className="manager-page manager-profile-page">
      <div className="greeting">ОСОБИСТИЙ КАБІНЕТ</div>
      <h1 className="hub-h1">Профіль</h1>

      <div className="mgr-profile">
        <div className="mgr-profile-main">
          <ProfileCard
            dbName={data.dbName}
            hasEmail={data.hasEmail}
            externalCode={data.externalCode}
            levelLabel={data.levelLabel}
            avatarUrl={data.avatarUrl}
            editable
          />
          <div className="hub-sec-title">
            <h3>Дані</h3>
          </div>
          <ProfileDetailPanel externalCode={data.externalCode} managerEmail={data.managerEmail} firstLoginAt={data.firstLoginAt} />
        </div>
        <div className="mgr-profile-side">
          <div className="hub-sec-title">
            <h3>Сповіщення</h3>
          </div>
          <NotificationSettings />
        </div>
      </div>
    </div>
  );
}
