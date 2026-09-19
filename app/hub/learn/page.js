import { getCurrentUser } from "@/lib/session";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { groupLearning } from "@/lib/progress";
import { CourseTile } from "@/components/CourseTile";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Портовано з .hub-screen[data-tab="learning"] в legacy index.html.
// Захардкоджені картки-заглушки ("скоро", без реального курсу під ними)
// прибрані — показуємо лише реально призначені курси (Enrollment),
// згруповані за пріоритетом (lib/progress.js groupLearning): обов'язкові
// з найближчим дедлайном → рекомендовані → пройдені.
export default async function HubLearnPage() {
  const employee = await getCurrentUser();
  const enrollments = await getEmployeeEnrollments(employee.id);
  const groups = groupLearning(enrollments);
  const sections = [
    ["Обов'язково", groups.mandatory],
    ["Рекомендовано", groups.optional],
    ["Пройдено", groups.completed],
  ].filter(([, list]) => list.length > 0);

  return (
    <section className="hub-screen">
      <div className="greeting">РОЗДІЛИ НАВЧАННЯ</div>
      <h1 className="hub-h1">Навчання</h1>

      {enrollments.length === 0 && <p className="hub-empty-note">Вам ще не призначено жодного курсу.</p>}
      {sections.map(([title, list]) => (
        <div key={title}>
          <div className="hub-sec-title">
            <h3>
              {title} <span className="hub-sec-count">{list.length}</span>
            </h3>
          </div>
          {list.map((enrollment) => (
            <CourseTile
              key={enrollment.id}
              course={enrollment.course}
              enrollment={enrollment}
              description={enrollment.course.description || ""}
              hasEmail={Boolean(employee.email)}
            />
          ))}
        </div>
      ))}
    </section>
  );
}
