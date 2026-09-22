import { getCurrentUser } from "@/lib/session";
import { getHubHomeData } from "@/lib/employeeProgress";
import { getEmployeeRating } from "@/lib/rating";
import { CourseTile } from "@/components/CourseTile";
import { ProfileCard } from "@/components/ProfileCard";
import { GreetingHeading } from "@/components/GreetingHeading";
import { NotificationSettings } from "@/components/NotificationSettings";
import { MandatoryCard } from "@/components/RatingBlocks";

// Портовано з .hub-screen[data-tab="home"] в legacy index.html +
// js/cabinet.js. Дані — з БД (Enrollment) замість localStorage.

// TODO: Cache Components adoption. Route "/hub" ловило "uncached data
// during render" (blocking-prerender-dynamic) у dev — Next у такому стані
// іноді лишав ОБИДВА дерева (Suspense-фолбек HubShellSkeleton і реальний
// контент) змонтованими одночасно (2026-09-22, живий баг: NotificationSettings
// variant="card" рахував правильний стан у консолі, але видимий DOM
// лишався тим, застарілим деревом). Прибрати опт-аут можна, коли весь
// маршрут пройде через next-dev-loop/Cache Components adoption.
export const instant = false;

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

  return (
    <section className="hub-screen">
      <GreetingHeading greet={greet} />

      <ProfileCard
        dbName={employee.name}
        hasEmail={Boolean(employee.email)}
        levelLabel={rating.level.label}
        avatarUrl={employee.avatarUrl}
        href="/hub/achievements?highlight=rating"
      />

      <NotificationSettings variant="card" />

      <MandatoryCard progress={mandatory} href="/hub/learn" />

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
