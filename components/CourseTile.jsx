"use client";

import { useState } from "react";
import Link from "next/link";
import { CourseIcon, ChevronIcon, CheckIcon, XIcon, LockIcon, MedalIcon, CertificateIcon } from "@/components/icons";
import { courseTileStatus, isRecentlyAssigned, isOverdue, medalTier } from "@/lib/progress";
import { pluralize } from "@/lib/pluralize";
import { MarqueeText } from "@/components/MarqueeText";

const MODULE_STATUS_META = {
  completed: { label: "Складено", className: "is-completed" },
  failed: { label: "Не складено", className: "is-failed" },
  available: { label: "Доступний", className: "is-available" },
  locked: { label: "Заблоковано", className: "is-locked" },
};

function ModuleStatusIcon({ status }) {
  if (status === "completed") return <CheckIcon />;
  if (status === "failed") return <XIcon />;
  if (status === "locked") return <LockIcon />;
  return <span className="ct-module-dot" aria-hidden="true" />;
}

/**
 * Один модуль курсу всередині акордеону CourseTile — лише попередній
 * перегляд (статус/бал), не окремий вхід у плеєр: плеєр завжди веде
 * безперервне проходження від початку/збереженого localStorage-прогресу
 * (components/CoursePlayer.jsx), у нього немає "почати саме з цього
 * модуля".
 */
function ModuleRow({ courseModule }) {
  const meta = MODULE_STATUS_META[courseModule.status];
  return (
    <div className={`ct-module-row ${meta.className}`}>
      <span className="ct-module-status-icon">
        <ModuleStatusIcon status={courseModule.status} />
      </span>
      <MarqueeText className="ct-module-title">{courseModule.title}</MarqueeText>
      {courseModule.scorePercent != null && <span className="ct-module-score">{courseModule.scorePercent}%</span>}
      {courseModule.longestCorrectStreak > 0 && (
        <span className="ct-module-streak" title="Найдовша серія поспіль правильних відповідей у цьому модулі">
          🎯 {courseModule.longestCorrectStreak}
        </span>
      )}
      {medalTier(courseModule.scorePercent) && (
        <span className="ct-module-medal" title={`${courseModule.scorePercent}% — медаль за модуль`}>
          <MedalIcon tier={medalTier(courseModule.scorePercent)} />
        </span>
      )}
    </div>
  );
}

/**
 * Картка курсу на Home/Learning табах — портовано з .course-tile в
 * legacy index.html, дані тепер з Enrollment (БД) замість localStorage.
 *
 * Курс = контейнер модулів (Course -> Module -> Screen -> Component): раніше
 * вся картка була суцільним посиланням у плеєр, і кілька курсів з
 * однаковим префіксом назви ("Технік розливного обладнання: ...") виглядали
 * як незалежний один від одного пласкій ряд пунктів. Тепер клік по картці
 * розгортає акордеоном СПИСОК МОДУЛІВ САМЕ ЦЬОГО курсу (зі статусом
 * складено/не складено/доступний/заблоковано) — вхід у сам плеєр окремою
 * дією нижче.
 */
export function CourseTile({ course, enrollment, description, inProgressDescription }) {
  const [expanded, setExpanded] = useState(false);
  const cs = courseTileStatus(enrollment);
  const desc = cs.status === "in_progress" && inProgressDescription ? inProgressDescription : description;
  const isNew = isRecentlyAssigned(enrollment);
  const overdue = isOverdue(enrollment);
  const modules = course.modules || [];
  const hasModules = modules.length > 0;
  // Enrollment.status="completed" МАЄ означати, що кожен модуль курсу вже
  // має власний результат (completed/failed) — але це два окремі записи
  // в БД (Enrollment і ModuleCompletion), і якщо колись один запис
  // з'явився, а другий ні (напр. до фіксу гонки записів у /submit), курс
  // виглядав "завершеним" з балом, поки один із модулів лишався порожнім
  // — саме так, як показала користувачу картка. Тому кнопка орієнтується
  // на РЕАЛЬНИЙ стан модулів, а не сліпо на статус курсу.
  const allModulesResolved = !hasModules || modules.every((m) => m.status === "completed" || m.status === "failed");
  const isActuallyDone = cs.status === "completed" && allModulesResolved;
  const anyModuleStarted = modules.some((m) => m.status === "completed" || m.status === "failed");
  // "Почати курс" ЛИШЕ коли жоден модуль ще не торкнутий І сам enrollment
  // справді ще не розпочато — courseTileStatus() згортає "overdue" в
  // "not_started" (для КОЛЬОРУ/пілу це правильно), але для тексту кнопки
  // прострочений курс — це вже "почався" (час іде), тому має бути
  // "Продовжити", а не "Почати" (реальна скарга користувача: "курс уже
  // начався, тут має бути продовжити"). Звідси — сирий enrollment.status,
  // не cs.status.
  const trulyNotStarted = enrollment?.status === "not_started" && !anyModuleStarted;

  const enterLabel = isActuallyDone ? "Переглянути курс" : trulyNotStarted ? "Почати курс" : "Продовжити курс";
  const hasCertificate = enrollment?.scorePercent === 100;

  return (
    <div className="course-tile">
      <button
        type="button"
        className="ct-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        disabled={!hasModules}
        title={hasModules ? (expanded ? "Згорнути список модулів" : "Розгорнути список модулів") : undefined}
      >
        {hasModules && (
          <span className={`admin-course-row-caret ct-caret${expanded ? " open" : ""}`}>
            <ChevronIcon />
          </span>
        )}
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
          {hasModules && <div className="ct-modules-count">{pluralize(modules.length, "модуль", "модулі", "модулів")}</div>}
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
      </button>

      {expanded && hasModules && (
        <div className="ct-modules-list">
          {modules.map((courseModule) => (
            <ModuleRow key={courseModule.id} courseModule={courseModule} />
          ))}
        </div>
      )}

      {/* Коли курс повністю пройдено — два прямокутники в ряд: основний
          "Переглянути курс" (веде в методичку) і квадратна кнопка
          сертифіката праворуч (за проханням користувача). Сертифікат —
          лише за 100% (не 80%, той поріг лише "залік"): окрема, вища
          планка, щоб заохотити вчити матеріал по-справжньому, а не просто
          "пройти поріг". Поки курс ще не пройдено повністю — звичайна
          одна кнопка "Почати"/"Продовжити", сертифікату ще нема що
          показувати. */}
      {isActuallyDone ? (
        <div className="ct-cta-row">
          <Link href={`/courses/${course.slug}`} className="ct-enter-link ct-enter-link--flex">
            <span>{enterLabel}</span>
            <span className="ct-enter-chevron">
              <ChevronIcon />
            </span>
          </Link>
          {hasCertificate ? (
            <a
              href={`/api/courses/${course.slug}/certificate`}
              className="ct-cert-square"
              aria-label="Завантажити сертифікат"
              title="Завантажити сертифікат"
            >
              <CertificateIcon />
            </a>
          ) : (
            <span
              className="ct-cert-square ct-cert-square-disabled"
              aria-label="Сертифікат доступний при 100% проходженні курсу"
              title="Сертифікат доступний при 100% проходженні курсу"
            >
              <CertificateIcon />
            </span>
          )}
        </div>
      ) : null}
      {/* На мобільному немає ховеру для title-тултипа на кнопці — без
          явного підпису людина могла й не здогадатись, що по іконці
          сертифіката взагалі можна натиснути. */}
      {isActuallyDone && hasCertificate && (
        <p className="ct-certificate-caption">🏆 Натисніть на іконку сертифіката праворуч, щоб завантажити</p>
      )}
      {!isActuallyDone && (
        <Link href={`/courses/${course.slug}`} className="ct-enter-link">
          <span>{enterLabel}</span>
          <span className="ct-enter-chevron">
            <ChevronIcon />
          </span>
        </Link>
      )}
    </div>
  );
}
