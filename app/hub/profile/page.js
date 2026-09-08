import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { initials } from "@/lib/initials";
import { computeXp } from "@/lib/progress";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";

// Портовано з .hub-screen[data-tab="profile"] в legacy index.html.
// pdSvEmail ("Керівник (email)") тепер employee.manager.email замість
// плаского profile.svEmail; pdRegisteredAt — employee.firstLoginAt
// замість profile.registeredAt.
export default async function HubProfilePage() {
  const sessionUser = await getCurrentUser();
  const employee = await prisma.employee.findUnique({
    where: { id: sessionUser.id },
    include: { manager: true },
  });
  const enrollments = await getEmployeeEnrollments(employee.id);
  const { levelLabel } = computeXp(enrollments);

  return (
    <section className="hub-screen">
      <div className="greeting">ОСОБИСТИЙ КАБІНЕТ</div>
      <h1 className="hub-h1">Профіль</h1>

      <div className="profile-card">
        <div className="avatar">{initials(employee.name)}</div>
        <div className="profile-info">
          <div className="profile-name">{employee.name || "—"}</div>
          <div className="profile-meta">{(employee.externalCode || "").toUpperCase()}</div>
          <div className="profile-level">
            <span className="lv-star">★</span>
            <span>{levelLabel}</span>
          </div>
        </div>
      </div>

      <div className="profile-detail-list">
        <div className="pd-row">
          <span className="pd-k">Ваш код</span>
          <span className="pd-v">{(employee.externalCode || "—").toUpperCase()}</span>
        </div>
        <div className="pd-row">
          <span className="pd-k">Керівник (email)</span>
          <span className="pd-v">{employee.manager?.email || "—"}</span>
        </div>
        <div className="pd-row">
          <span className="pd-k">Зареєстровано</span>
          <span className="pd-v">
            {employee.firstLoginAt
              ? new Date(employee.firstLoginAt).toLocaleDateString("uk-UA")
              : "—"}
          </span>
        </div>
      </div>
      <p className="hub-empty-note">
        Дані використовуються лише для проходження курсів і зберігаються в системі компанії.
      </p>
    </section>
  );
}
