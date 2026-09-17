"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CourseIcon, ChevronIcon, CheckIcon, XIcon, LockIcon, MedalIcon, CertificateIcon, ClockIcon, SpinnerIcon } from "@/components/icons";
import { StatusBadge } from "@/components/StatusBadge";
import { courseTileStatus, isRecentlyAssigned, isOverdue, medalTier } from "@/lib/progress";
import { pluralize } from "@/lib/pluralize";
import { MarqueeText } from "@/components/MarqueeText";
import { HintDot } from "@/components/HintDot";
import { getLocalDisplayName } from "@/lib/localName";
import { downloadCertificate } from "@/lib/downloadCertificate";

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
function ModuleRow({ courseModule, columns }) {
  const meta = MODULE_STATUS_META[courseModule.status];
  const tier = medalTier(courseModule.scorePercent);
  return (
    <div className={`ct-module-row ${meta.className}`}>
      <span className="ct-module-status-icon">
        <ModuleStatusIcon status={courseModule.status} />
      </span>
      <MarqueeText className="ct-module-title">{courseModule.title}</MarqueeText>
      {courseModule.scorePercent != null ? (
        <span className="ct-module-score">{courseModule.scorePercent}%</span>
      ) : (
        // Орієнтовний час — лише поки модуль ще не пройдено (після цього
        // важливіший реальний бал, не приблизна оцінка "скільки б це
        // зайняло"). Порахований автоматично з реального контенту модуля
        // (lib/courseContent.js estimateModuleMinutes), не ручне поле в
        // /admin — завжди відповідає справжньому вмісту.
        <span className="ct-module-time" title="Орієнтовний час проходження">
          <ClockIcon />
          {courseModule.estimatedMinutes} хв
        </span>
      )}
      {/* Колонка медалі є в КОЖНОМУ рядку, якщо медаль є хоч в одному
          модулі списку (порожня — теж), інакше відсотки й медалі різних
          рядків з'їжджали в різні позиції. Серію правильних відповідей
          (longestCorrectStreak) у картках більше не показуємо — лишилась
          у базі та Excel-звітах (користувач, 2026-09-17). */}
      {columns.medal && (
        <span className="ct-module-medal" title={tier ? `${courseModule.scorePercent}% — медаль за модуль` : undefined}>
          {tier && <MedalIcon tier={tier} />}
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
export function CourseTile({ course, enrollment, description, inProgressDescription, hasEmail = true }) {
  const [expanded, setExpanded] = useState(false);
  // Сертифікат генерується на сервері (route.js, pdfkit) з Employee.name —
  // для співробітників без email це заглушка з посади/території (див.
  // lib/localName.js), а справжнє ім'я лежить лише в localStorage цього
  // пристрою. Сервер його принципово не зберігає, тому передаємо як
  // query-параметр разового GET-запиту на завантаження (не пишеться в БД,
  // читається лише всередині цього одного запиту) — той самий підхід, що
  // ProfileCard/GreetingHeading уже роблять для екранного імені.
  const [certName, setCertName] = useState("");
  useEffect(() => {
    if (!hasEmail) {
      const local = getLocalDisplayName();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (local) setCertName(local);
    }
  }, [hasEmail]);
  // Раніше — звичайний <a href="...certificate">: на мобільному/PWA це
  // відкривало PDF прямо у вкладці замість завантаження, без жодної
  // навігації назад (реальна скарга користувача). Тепер тягнемо файл
  // через fetch+blob (lib/downloadCertificate.js) — сторінка нікуди не
  // переходить, лише системний діалог "Зберегти файл".
  const [certDownloading, setCertDownloading] = useState(false);
  const [certDownloadError, setCertDownloadError] = useState("");
  async function handleDownloadCertificate() {
    setCertDownloading(true);
    setCertDownloadError("");
    try {
      await downloadCertificate(course.slug, certName);
    } catch (err) {
      setCertDownloadError(err.message || "Не вдалося завантажити сертифікат.");
    } finally {
      setCertDownloading(false);
    }
  }
  const cs = courseTileStatus(enrollment);
  const desc = cs.status === "in_progress" && inProgressDescription ? inProgressDescription : description;
  const isNew = isRecentlyAssigned(enrollment);
  const overdue = isOverdue(enrollment);
  const modules = course.modules || [];
  const hasModules = modules.length > 0;
  const moduleColumns = {
    medal: modules.some((m) => medalTier(m.scorePercent)),
  };
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

  // Пройдений курс: 100% відкриває методичку; залік нижче 100% — можна
  // покращити; незалік — пройти знову (користувач, 2026-09-15).
  const enterLabel = isActuallyDone
    ? cs.passed
      ? cs.pct === 100
        ? "Відкрити методичку"
        : "Покращити результат"
      : "Пройти курс знову"
    : trulyNotStarted
      ? "Почати курс"
      : "Продовжити курс";
  // Сертифікат — лише за 100% І лише якщо він узагалі увімкнений для
  // цього курсу (Course.certificateEnabled, вкладка "Розклад" в /admin).
  // !== false, а не === true: курси, завантажені без цього поля
  // (старий кеш, урізана вибірка), поводяться як раніше — з сертифікатом.
  const certificateAllowed = course.certificateEnabled !== false;
  const hasCertificate = certificateAllowed && enrollment?.scorePercent === 100;

  return (
    <div className="course-tile">
      {/* Шапка картки — вертикальний стос: теги верхнім рівнем, під ними
          назва курсу, кількість модулів і опис на всю ширину картки, і
          нижче — підсумок пройденого курсу разом із сертифікатом.
          Теги й підсумок винесені з .ct-toggle не з міркувань розкладки,
          а технічно й безальтернативно: .ct-toggle — це <button>, кнопка
          завантаження сертифіката теж <button>, а вкладати кнопку в
          кнопку не можна (невалідна розмітка + помилка гідратації React).
          Тому шапка — звичайний <div>, а не сам заголовок-акордеон. */}
      <div className="ct-head">
        <div className="ct-head-aside">
          <span className="ct-tags">
            {isNew && <span className="ct-tag ct-tag-new">Нове</span>}
            {course.category && <span className="ct-tag">{course.category}</span>}
            {enrollment?.isMandatory && <span className="ct-tag ct-tag-mandatory">Обов&apos;язково</span>}
          </span>
        </div>

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
            </div>
            {hasModules && <div className="ct-modules-count">{pluralize(modules.length, "модуль", "модулі", "модулів")}</div>}
            <div className="ct-desc">{desc}</div>
            {enrollment?.dueDate && cs.status !== "completed" && (
              <div className={`ct-due${overdue ? " is-overdue" : ""}`}>
                {overdue ? "Термін минув · " : "Термін до "}
                {new Date(enrollment.dueDate).toLocaleDateString("uk-UA")}
              </div>
            )}
            {cs.status !== "completed" && (
              <div className="ct-progress-row">
                <div className="ct-progress-track">
                  <div className="ct-progress-fill" style={{ width: `${cs.pct}%` }} />
                </div>
                <span className="ct-progress-pct">{cs.pct}%</span>
              </div>
            )}
          </div>
        </button>

        {/* Підсумок пройденого курсу і сертифікат — ОДИН контейнер, в один
            рівень: результат ("Залік · 100%"), дата завершення й кнопка
            завантаження стосуються одного й того самого факту, і розводити
            їх по різних кутах картки не було сенсу.
            Живе поза .ct-toggle, бо .ct-toggle — <button>, а сертифікат
            теж <button> (вкладати не можна, див. коментар вище). */}
        {cs.status === "completed" && (
          <div className="ct-done-row">
            <div className="ct-done-main">
              {/* Відсоток лише при заліку — при незаліку він не має сенсу
                  (курс складається помодульно). */}
              <StatusBadge passed={Boolean(cs.passed)} icon>
                {cs.passed ? `Залік · ${cs.pct}%` : "Незалік"}
              </StatusBadge>
              {enrollment?.completedAt && (
                <div className="ct-completed-date">
                  Завершено {new Date(enrollment.completedAt).toLocaleDateString("uk-UA")}
                </div>
              )}
            </div>
            {/* Сертифікат — лише за 100% (не 80%, той поріг лише "залік"):
                вища планка, щоб заохотити вчити матеріал, а не просто
                перейти поріг. */}
            {/* Коли сертифікат для курсу вимкнений — ряд не рендериться
                взагалі. Показувати неактивний квадрат із підписом
                "доступний при 100%" було б прямою неправдою: тут він не
                з'явиться за жодного балу. */}
            {isActuallyDone && certificateAllowed && (
              <div className="ct-cert-row">
                {hasCertificate ? (
                  <>
                    <button
                      type="button"
                      onClick={handleDownloadCertificate}
                      disabled={certDownloading}
                      className="ct-cert-square"
                      aria-label="Завантажити сертифікат"
                    >
                      {certDownloading ? <SpinnerIcon /> : <CertificateIcon />}
                    </button>
                    {/* Раніше це був постійний рядок-підпис під карткою
                        ("Натисніть на іконку сертифіката праворуч…") — він
                        з'їдав висоту в кожній картці заради пояснення, яке
                        потрібне один раз. */}
                    <HintDot text="Натисніть на іконку сертифіката, щоб завантажити PDF із вашим ім'ям та результатом курсу." />
                  </>
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
            )}
          </div>
        )}
      </div>

      {expanded && hasModules && (
        <div className="ct-modules-list">
          {modules.map((courseModule) => (
            <ModuleRow key={courseModule.id} courseModule={courseModule} columns={moduleColumns} />
          ))}
        </div>
      )}

      {certDownloadError && <p className="ct-certificate-caption ct-certificate-error">{certDownloadError}</p>}
      {/* ОДНА кнопка на всю ширину в будь-якому стані курсу
          ("Почати"/"Продовжити"/"Переглянути"). Раніше для пройденого
          курсу тут був ряд із двох елементів — кнопка входу плюс квадрат
          сертифіката, — через що "Переглянути курс" виходила помітно
          коротшою за "Продовжити курс" у сусідніх картках сітки, а
          підпис-пояснення під рядом ще й зсував її по висоті. Сертифікат
          переїхав під теги у шапці, підпис став підказкою по ховеру. */}
      <Link href={`/courses/${course.slug}`} className="ct-enter-link">
        <span>{enterLabel}</span>
        <span className="ct-enter-chevron">
          <ChevronIcon />
        </span>
      </Link>
    </div>
  );
}
