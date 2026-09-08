import { getCurrentUser } from "@/lib/session";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { CourseTile } from "@/components/CourseTile";
import { WelcomeIcon, MerchIcon, ChatIcon, PeopleIcon } from "@/components/icons";

// Портовано з .hub-screen[data-tab="learning"] в legacy index.html.
// Реальні призначені курси — з Enrollment; картки "скоро" лишились
// захардкоженими заглушками, як і в legacy (контенту під них ще нема).
export default async function HubLearnPage() {
  const employee = await getCurrentUser();
  const enrollments = await getEmployeeEnrollments(employee.id);

  return (
    <section className="hub-screen">
      <div className="greeting">РОЗДІЛИ НАВЧАННЯ</div>
      <h1 className="hub-h1">Навчання</h1>

      <div className="hub-sec-title">
        <h3>Адаптація</h3>
      </div>
      <div className="placeholder-card">
        <div className="ct-icon">
          <WelcomeIcon />
        </div>
        <div className="ct-body">
          <div className="ct-top">
            <span className="ct-title">Знайомство з компанією</span>
            <span className="pc-soon">скоро</span>
          </div>
          <div className="ct-desc">Історія Carlsberg Ukraine, цінності та структура команди.</div>
        </div>
      </div>

      <div className="hub-sec-title" style={{ marginTop: 6 }}>
        <h3>Навички продажів</h3>
      </div>
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

      <div className="placeholder-card">
        <div className="ct-icon">
          <MerchIcon />
        </div>
        <div className="ct-body">
          <div className="ct-top">
            <span className="ct-title">Мерчандайзинг на полиці</span>
            <span className="pc-soon">скоро</span>
          </div>
          <div className="ct-desc">Стандарти викладки та POS-матеріали в торговій точці.</div>
        </div>
      </div>
      <div className="placeholder-card">
        <div className="ct-icon">
          <ChatIcon />
        </div>
        <div className="ct-body">
          <div className="ct-top">
            <span className="ct-title">Робота із запереченнями</span>
            <span className="pc-soon">скоро</span>
          </div>
          <div className="ct-desc">Розбір типових заперечень клієнта і сильні відповіді.</div>
        </div>
      </div>
      <div className="placeholder-card">
        <div className="ct-icon">
          <PeopleIcon />
        </div>
        <div className="ct-body">
          <div className="ct-top">
            <span className="ct-title">Навички перемовин</span>
            <span className="pc-soon">скоро</span>
          </div>
          <div className="ct-desc">Домовленості з торговою точкою про додаткові обсяги.</div>
        </div>
      </div>
    </section>
  );
}
