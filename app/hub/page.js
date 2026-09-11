import { getCurrentUser } from "@/lib/session";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { computeXp, pickContinueEnrollments } from "@/lib/progress";
import { getTimeBasedGreeting } from "@/lib/greeting";
import { CourseTile } from "@/components/CourseTile";
import { ProfileCard } from "@/components/ProfileCard";
import { GreetingHeading } from "@/components/GreetingHeading";

// Портовано з .hub-screen[data-tab="home"] в legacy index.html +
// js/cabinet.js. Дані — з БД (Enrollment) замість localStorage.

export default async function HubHomePage() {
  const employee = await getCurrentUser();
  const enrollments = await getEmployeeEnrollments(employee.id);

  const { xp, xpMax, levelLabel, completedCount } = computeXp(enrollments);
  const passedCount = enrollments.filter((e) => e.status === "completed" && e.passed).length;
  const lastCompleted = [...enrollments].reverse().find((e) => e.status === "completed");
  // До 3 незавершених призначень — раніше показувалось лише одне
  // ("найстаріше з непройдених"), тепер видно все, чим варто зайнятись.
  const continueEnrollments = pickContinueEnrollments(enrollments, 3);

  const greet = getTimeBasedGreeting();

  return (
    <section className="hub-screen">
      {/* Раніше тут був окремий kicker {greet.toUpperCase()} над заголовком
          — прибрано разом із "Вітаємо" в GreetingHeading: заголовок сам
          містить і привітання, і ім'я, окремий рядок над ним лише
          дублював той самий текст. */}
      <GreetingHeading dbName={employee.name} hasEmail={Boolean(employee.email)} greet={greet} />

      <ProfileCard
        dbName={employee.name}
        hasEmail={Boolean(employee.email)}
        externalCode={employee.externalCode}
        levelLabel={levelLabel}
      />

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
      {continueEnrollments.length > 0 ? (
        continueEnrollments.map((enrollment) => (
          <CourseTile
            key={enrollment.id}
            course={enrollment.course}
            enrollment={enrollment}
            description={enrollment.course.description || ""}
            inProgressDescription="Ви вже почали — продовжте з того самого місця."
            hasEmail={Boolean(employee.email)}
          />
        ))
      ) : enrollments.length === 0 ? (
        <p className="hub-empty-note">Вам ще не призначено жодного курсу.</p>
      ) : (
        <p className="hub-empty-note">Усі призначені курси пройдено — так тримати! 🎉</p>
      )}
      <p className="hub-empty-note">Нові курси й розділи з&apos;являться тут найближчим часом.</p>
    </section>
  );
}
