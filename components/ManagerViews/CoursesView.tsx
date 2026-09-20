"use client";

import { useViewData } from "@/components/useViewData";
import { CourseTile } from "@/components/CourseTile";
import { PageSkeleton } from "@/components/Skeleton";

type CoursesData = { enrollments: unknown[]; hasEmail: boolean };

async function fetchCourses(): Promise<CoursesData> {
  const res = await fetch("/api/manager/courses");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

// Той самий вміст, що app/manager/courses/page.js (SSR-версія для
// прямого заходу/F5) — тут клієнтська, для перемикання вкладки без
// реальної Next.js-навігації (ManagerShell.jsx).
export function CoursesView() {
  const { data, loading, error } = useViewData("/manager/courses", fetchCourses);

  if (loading) {
    return (
      <div className="manager-page">
        <PageSkeleton />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="manager-page">
        <p className="admin-hint">Не вдалося завантажити курси. Спробуйте оновити сторінку.</p>
      </div>
    );
  }

  const { enrollments, hasEmail } = data;

  return (
    <div className="manager-page">
      <div className="greeting">МОЇ КУРСИ</div>
      <h1 className="hub-h1">Курси</h1>

      {enrollments.length > 0 ? (
        <div className="card-grid mgr-course-grid">
          {(enrollments as any[]).map((enrollment) => (
            <CourseTile
              key={enrollment.id}
              course={enrollment.course}
              enrollment={enrollment}
              description={enrollment.course.description || ""}
              inProgressDescription={undefined}
              hasEmail={hasEmail}
            />
          ))}
        </div>
      ) : (
        <p className="hub-empty-note">Вам ще не призначено жодного курсу.</p>
      )}
    </div>
  );
}
