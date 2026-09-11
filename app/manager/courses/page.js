import { getCurrentUser } from "@/lib/session";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { CourseTile } from "@/components/CourseTile";

// "Курси" керівника — його ВЛАСНІ призначені курси (керівник теж Employee
// зі своїми enrollments), той самий CourseTile і той самий паттерн, що
// app/hub/learn/page.js — але під ManagerShell (sidebar/hamburger), не
// HubShell.
export default async function ManagerCoursesPage() {
  const employee = await getCurrentUser();
  const enrollments = await getEmployeeEnrollments(employee.id);

  return (
    <div className="manager-page manager-hub-page">
      <div className="greeting">МОЇ КУРСИ</div>
      <h1 className="hub-h1">Курси</h1>

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
    </div>
  );
}
