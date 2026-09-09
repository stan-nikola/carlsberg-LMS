import Link from "next/link";
import { CourseIcon, ChevronIcon, CheckIcon, XIcon } from "@/components/icons";
import { courseTileStatus } from "@/lib/progress";

/**
 * Карточка курсу на Home/Learning табах — портовано з .course-tile в
 * legacy index.html, дані тепер з Enrollment (БД) замість localStorage.
 */
export function CourseTile({ course, enrollment, tag, description, inProgressDescription }) {
  const cs = courseTileStatus(enrollment);
  const desc = cs.status === "in_progress" && inProgressDescription ? inProgressDescription : description;

  return (
    <Link href={`/courses/${course.slug}`} className="course-tile">
      <div className="ct-icon">
        <CourseIcon />
      </div>
      <div className="ct-body">
        <div className="ct-top">
          <span className="ct-title">{course.title}</span>
          {tag && <span className="ct-tag">{tag}</span>}
        </div>
        <div className="ct-desc">{desc}</div>
        {cs.status === "completed" ? (
          <div className={`ct-status-done ${cs.passed ? "is-pass" : "is-fail"}`}>
            {cs.passed ? <CheckIcon /> : <XIcon />}
            <span>{(cs.passed ? "Залік · " : "Незалік · ") + cs.pct + "%"}</span>
          </div>
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
