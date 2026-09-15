import { getCurrentUser } from "@/lib/session";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { pickContinueEnrollments } from "@/lib/progress";
import { mandatoryProgress } from "@/lib/ratingLogic";
import { getEmployeeRating } from "@/lib/rating";
import { getTimeBasedGreeting } from "@/lib/greeting";
import { CourseTile } from "@/components/CourseTile";
import { ProfileCard } from "@/components/ProfileCard";
import { GreetingHeading } from "@/components/GreetingHeading";
import { NotificationSettings } from "@/components/NotificationSettings";
import { RatingCard, MandatoryCard } from "@/components/RatingBlocks";

// Портовано з .hub-screen[data-tab="home"] в legacy index.html +
// js/cabinet.js. Дані — з БД (Enrollment) замість localStorage.

export default async function HubHomePage() {
  const employee = await getCurrentUser();
  const enrollments = await getEmployeeEnrollments(employee.id);

  // Рейтинг (бали за реальні заслуги, lib/rating.js) замість колишнього
  // «Прогрес адаптації 200/200 XP», який упирався в стелю після двох курсів.
  const rating = await getEmployeeRating(employee);
  const mandatory = mandatoryProgress(enrollments);
  const completedCount = enrollments.filter((e) => e.status === "completed").length;
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
        levelLabel={rating.level.label}
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
