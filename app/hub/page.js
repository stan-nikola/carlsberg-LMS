import { getCurrentUser } from "@/lib/session";
import { getHubHomeData } from "@/lib/employeeProgress";
import { getEmployeeRating } from "@/lib/rating";
import { CourseTile } from "@/components/CourseTile";
import { ProfileCard } from "@/components/ProfileCard";
import { GreetingHeading } from "@/components/GreetingHeading";
import { NotificationSettings } from "@/components/NotificationSettings";
import { RatingCard, MandatoryCard } from "@/components/RatingBlocks";

// Портовано з .hub-screen[data-tab="home"] в legacy index.html +
// js/cabinet.js. Дані — з БД (Enrollment) замість localStorage.

export default async function HubHomePage() {
  const employee = await getCurrentUser();
  // mandatory / continueEnrollments / greet рахуються всередині кеш-межі
  // (lib/employeeProgress.js getHubHomeData) — див. коментар там.
  const [{ enrollments, mandatory, continueEnrollments, greet }, rating] = await Promise.all([
    getHubHomeData(employee.id),
    // Рейтинг (бали за реальні заслуги, lib/rating.ts) замість колишнього
    // «Прогрес адаптації 200/200 XP», який упирався в стелю після двох курсів.
    getEmployeeRating(employee),
  ]);
  const completedCount = enrollments.filter((e) => e.status === "completed").length;
  const lastCompleted = [...enrollments].reverse().find((e) => e.status === "completed");

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
        levelLabel={rating.level.label}
        avatarUrl={employee.avatarUrl}
      />

      <NotificationSettings variant="card" />

      <RatingCard rating={rating} cohortLabel={employee.position?.name ? `на посаді ${employee.position.code}` : "колег"} />
      <MandatoryCard progress={mandatory} />

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
          <b>{rating.badgesCount}</b>
          <span>Відзнак</span>
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
