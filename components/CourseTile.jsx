import Link from "next/link";
import { CourseIcon, ChevronIcon, CheckIcon, XIcon } from "@/components/icons";
import { courseTileStatus, isRecentlyAssigned, isOverdue } from "@/lib/progress";

/**
 * Карточка курсу на Home/Learning табах — портовано з .course-tile в
 * legacy index.html, дані тепер з Enrollment (БД) замість localStorage.
 */
export function CourseTile({ course, enrollment, description, inProgressDescription }) {
  const cs = courseTileStatus(enrollment);
  const desc = cs.status === "in_progress" && inProgressDescription ? inProgressDescription : description;
  const isNew = isRecentlyAssigned(enrollment);
  const overdue = isOverdue(enrollment);

  return (
    <Link href={`/courses/${course.slug}`} className="course-tile">
      <div className="ct-icon">
        <CourseIcon />
      </div>
      <div className="ct-body">
        <div className="ct-top">
          <span className="ct-title">{course.title}</span>
          <span className="ct-tags">
            {isNew && <span className="ct-tag ct-tag-new">Нове</span>}
            {course.category && <span className="ct-tag">{course.category}</span>}
            {enrollment?.isMandatory && <span className="ct-tag ct-tag-mandatory">Обов&apos;язково</span>}
          </span>
        </div>
        <div className="ct-desc">{desc}</div>
        {enrollment?.dueDate && cs.status !== "completed" && (
          <div className={`ct-due${overdue ? " is-overdue" : ""}`}>
            {overdue ? "Термін минув · " : "Термін до "}
            {new Date(enrollment.dueDate).toLocaleDateString("uk-UA")}
          </div>
        )}
        {cs.status === "completed" ? (
          <>
            <div className={`ct-status-done ${cs.passed ? "is-pass" : "is-fail"}`}>
              {cs.passed ? <CheckIcon /> : <XIcon />}
              <span>{(cs.passed ? "Залік · " : "Незалік · ") + cs.pct + "%"}</span>
            </div>
            {enrollment?.completedAt && (
              <div className="ct-completed-date">
                Завершено {new Date(enrollment.completedAt).toLocaleDateString("uk-UA")}
              </div>
            )}
          </>
        ) : (
          <div className="ct-progress-row">
            <div className="ct-progress-track">
              <div className="ct-progress-fill" style={{ width: `${cs.pct}%` }} />
            </div>
            <span className="ct-progress-pct">{cs.pct}%</span>
          </div>
        )}
      </div>
      <div className="ct-chevron">
        <ChevronIcon />
      </div>
    </Link>
  );
}
