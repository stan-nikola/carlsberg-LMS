"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Минимальный каркас /admin (шапка с логаутом) — сознательно не
 * использует брендовый .course-card shell хаба, см. app/styles/admin.css.
 */
export function AdminShell({ children }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div>
      <div className="admin-topbar">
        <Link href="/admin" className="admin-topbar-title">
          Адмін-панель
        </Link>
        <button className="admin-btn-link" onClick={handleLogout}>
          Вийти
        </button>
      </div>
      {children}
    </div>
  );
}
