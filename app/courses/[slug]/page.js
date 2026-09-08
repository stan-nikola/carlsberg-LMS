import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getCourseForPlayer, getEnrollmentForCourse, flattenLessons } from "@/lib/courseContent";
import { CoursePlayer } from "@/components/CoursePlayer";

// Доступ лише призначеним (є Enrollment) — на відміну від legacy, де курс
// відкривався будь-кому із профілем платформи; тепер призначення явне
// (assignCourseToRole / адмін-ендпоінт із Кроку 2).
export default async function CoursePage({ params }) {
  const { slug } = await params;
  const employee = await getCurrentUser();
  if (!employee) redirect("/register");

  const course = await getCourseForPlayer(slug);
  if (!course) notFound();

  const enrollment = await getEnrollmentForCourse(employee.id, course.id);
  if (!enrollment) {
    return (
      <div className="stage">
        <div className="course-col">
          <div className="course-card">
            <div className="cp-viewport">
              <div className="cp-screen">
                <h2 className="cp-h2">Курс ще не призначено</h2>
                <p className="cp-lead">
                  Цей курс вам поки не призначено. Зверніться до вашого керівника або адміністратора.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const screens = flattenLessons(course).map((lesson) => ({
    id: lesson.id,
    type: lesson.type,
    title: lesson.title,
    content: lesson.content,
  }));

  return (
    <CoursePlayer
      course={{
        id: course.id,
        slug: course.slug,
        title: course.title,
        description: course.description,
      }}
      screens={screens}
      enrollmentId={enrollment.id}
    />
  );
}
