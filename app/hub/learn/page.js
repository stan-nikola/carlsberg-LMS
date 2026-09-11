import { getCurrentUser } from "@/lib/session";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { CourseTile } from "@/components/CourseTile";

// Портовано з .hub-screen[data-tab="learning"] в legacy index.html.
// Захардкоджені картки-заглушки ("скоро", без реального курсу під ними)
// прибрані — показуємо лише реально призначені курси (Enrollment).
export default async function HubLearnPage() {
  const employee = await getCurrentUser();
  const enrollments = await getEmployeeEnrollments(employee.id);

  return (
    <section className="hub-screen">
      <div className="greeting">РОЗДІЛИ НАВЧАННЯ</div>
      <h1 className="hub-h1">Навчання</h1>

      {enrollments.length > 0 ? (
        enrollments.map((enrollment) => (
          <CourseTile
            key={enrollment.id}
            course={enrollment.course}
            enrollment={enrollment}
            description={enrollment.course.description || ""}
          />
        ))
      ) : (
        <p className="hub-empty-note">Вам ще не призначено жодного курсу.</p>
      )}
    </section>
  );
}
