import { getCurrentUser } from "@/lib/session";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { initials } from "@/lib/initials";
import { computeXp } from "@/lib/progress";
import { CourseTile } from "@/components/CourseTile";

// Портовано з .hub-screen[data-tab="home"] в legacy index.html +
// js/cabinet.js. Дані — з БД (Enrollment) замість localStorage.
function pickPrimaryEnrollment(enrollments) {
  return enrollments.find((e) => e.status !== "completed") || enrollments[0] || null;
}

export default async function HubHomePage() {
  const employee = await getCurrentUser();
  const enrollments = await getEmployeeEnrollments(employee.id);

  const { xp, xpMax, levelLabel, completedCount } = computeXp(enrollments);
  const passedCount = enrollments.filter((e) => e.status === "completed" && e.passed).length;
  const lastCompleted = [...enrollments].reverse().find((e) => e.status === "completed");
  const primary = pickPrimaryEnrollment(enrollments);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Доброго ранку" : hour < 18 ? "Доброго дня" : "Доброго вечора";

  return (
    <section className="hub-screen">
      <div className="greeting">{greet.toUpperCase()}</div>
      <h1 className="hub-h1">
        {employee.name ? `Вітаємо, ${employee.name.split(" ")[0]}!` : `${greet}!`}
      </h1>

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

      <div className="xp-wrap">
        <div className="xp-top">
          <span className="xp-label">Прогрес адаптації</span>
          <span className="xp-num">
            {xp} / {xpMax} XP
          </span>
        </div>
        <div className="xp-track">
          <div className="xp-fill" style={{ width: `${Math.round((xp / xpMax) * 100)}%` }} />
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-pill">
          <b>
            {completedCount}/{enrollments.length}
          </b>
          <span>Курсів</span>
        </div>
        <div className="stat-pill">
          <b>{lastCompleted ? `${lastCompleted.scorePercent}%` : "—"}</b>
          <span>Останній бал</span>
        </div>
        <div className="stat-pill">
          <b>{1 + (passedCount > 0 ? 1 : 0)}</b>
          <span>Досягнень</span>
        </div>
      </div>

      <div className="hub-sec-title">
        <h3>Продовжити навчання</h3>
      </div>
      {primary ? (
        <CourseTile
          course={primary.course}
          enrollment={primary}
          tag="Навички продажів"
          description={primary.course.description || ""}
          inProgressDescription="Ви вже почали — продовжте з того самого місця."
        />
      ) : (
        <p className="hub-empty-note">Вам ще не призначено жодного курсу.</p>
      )}
      <p className="hub-empty-note">Нові курси й розділи з&apos;являться тут найближчим часом.</p>
    </section>
  );
}
