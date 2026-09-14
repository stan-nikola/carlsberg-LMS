import { getCurrentUser } from "@/lib/session";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { CourseTile } from "@/components/CourseTile";

// "Курси" керівника — його ВЛАСНІ призначені курси (керівник теж Employee
// зі своїми enrollments), той самий CourseTile, що й app/hub/learn/page.js
// — але під ManagerShell (sidebar/hamburger), не HubShell.
//
// Розкладка тут НЕ така, як у /hub/learn: там телефонна ширина, і колонка
// карток одна за одною — правильно. Тут повноцінний десктоп, тому картки
// йдуть спільною сіткою .card-grid (app/globals.css) — стовпчик карток на
// всю ширину монітора лишав би дві третини екрана порожніми. Через це
// сторінка НЕ отримує .manager-hub-page (той обмежує 640px — лишається
// для Досягнень/Профілю, які справді сверстані під вузьку картку).
export default async function ManagerCoursesPage() {
  const employee = await getCurrentUser();
  const enrollments = await getEmployeeEnrollments(employee.id);

  return (
    <div className="manager-page">
      <div className="greeting">МОЇ КУРСИ</div>
      <h1 className="hub-h1">Курси</h1>

      {enrollments.length > 0 ? (
        <div className="card-grid mgr-course-grid">
          {enrollments.map((enrollment) => (
            <CourseTile
              key={enrollment.id}
              course={enrollment.course}
              enrollment={enrollment}
              description={enrollment.course.description || ""}
              hasEmail={Boolean(employee.email)}
            />
          ))}
        </div>
      ) : (
        <p className="hub-empty-note">Вам ще не призначено жодного курсу.</p>
      )}
    </div>
  );
}
