"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CourseIcon, ChevronIcon, CertificateIcon, SpinnerIcon } from "@/components/icons";
import { StatusBadge } from "@/components/StatusBadge";
import { courseTileStatus, isRecentlyAssigned, isOverdue, moduleProgress } from "@/lib/progress";
import { pluralize } from "@/lib/pluralize";
import { HintDot } from "@/components/HintDot";
import { getLocalDisplayName } from "@/lib/localName";
import { downloadCertificate } from "@/lib/downloadCertificate";

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
  const progress = moduleProgress(modules);
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
  // "Почати курс" ЛИШЕ коли жоден модуль ще не торкнутий, enrollment
  // справді ще не розпочато, І дедлайн ще не минув: прострочений курс —
  // це вже "почався" (час іде), тому має бути "Продовжити", а не "Почати"
  // (реальна скарга користувача: "курс уже начався, тут має бути
  // продовжити"). Раніше тут бракувало саме перевірки !overdue — картка
  // показувала "Почати курс" на прострочений, ще не відкритий курс
  // (2026-09-18, живий скрін користувача).
  const trulyNotStarted = enrollment?.status === "not_started" && !anyModuleStarted && !overdue;

  // Чи є ЗАРАЗ що перепроходити: хоч один складений нижче 100% модуль, у
  // якого вже минула пауза перепроходження (lib/courseContent.js
  // getModuleStatusList canRetakeNow — той самий розрахунок, яким
  // getSessionModules вирішує, відкрити плеєр чи методичку).
  // До 2026-09-19 картка дивилась ЛИШЕ на бал курсу: курс на 94%,
  // складений сьогодні, обіцяв «Покращити результат», а відкривався
  // методичкою — єдиний модуль нижче 100% був ще під 2-денною паузою
  // (жива скарга користувача, курс «Тест графіка: 10 модулів»).
  const canImproveNow = modules.some(
    (m) => m.status === "completed" && m.scorePercent !== null && m.scorePercent < 100 && m.canRetakeNow
  );
  // Найближчий момент, коли покращення стане можливим — щоб замість
  // мовчазної методички сказати, коли повертатись.
  const nextRetakeAt = modules
    .map((m) => m.retakeAvailableAt)
    .filter(Boolean)
    .map((d) => new Date(d))
    .sort((a, b) => a - b)[0] || null;

  // Пройдений курс: 100% (або поки нічого не можна перепройти) відкриває
  // методичку; залік нижче 100% із доступним модулем — можна покращити;
  // незалік — пройти знову (користувач, 2026-09-15).
  const enterLabel = isActuallyDone
    ? cs.passed
      ? cs.pct === 100 || !canImproveNow
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

        {/* Раніше тут був акордеон зі списком модулів. Прибрано
            2026-09-17: у сітці /manager/courses grid-auto-rows:1fr рівняє
            ВСІ ряди сітки, тож розкриття однієї картки роздувало кожну
            картку сторінки (263 -> 457px) і лишало дірки в сусідах. А сам
            список дублював план курсу в плеєрі, де до нього ще й дати
            відкриття, графік і кнопки перепроходження. Тепер картка —
            просто картка сталої висоти. */}
        <div className="ct-toggle">
          <div className="ct-icon">
            <CourseIcon />
          </div>
          <div className="ct-body">
            <div className="ct-top">
              <span className="ct-title">{course.title}</span>
            </div>
            {hasModules && <div className="ct-modules-count">{pluralize(modules.length, "модуль", "модулі", "модулів")}</div>}
            <div className="ct-desc">{desc}</div>
            {/* !isActuallyDone, не cs.status !== "completed" (2026-09-18,
                той самий фікс, що й прогрес-бар нижче): на курсі з
                неузгодженими даними дедлайн для решти модулів усе ще
                актуальний, ховати його тому, що enrollment уже мовчки
                позначено "completed", — неправда. */}
            {enrollment?.dueDate && !isActuallyDone && (
              <div className={`ct-due${overdue ? " is-overdue" : ""}`}>
                {overdue ? "Термін минув · " : "Термін до "}
                {new Date(enrollment.dueDate).toLocaleDateString("uk-UA")}
              </div>
            )}
            {/* Прогрес = складені модулі, не бал (lib/progress.js
                moduleProgress). До 2026-09-17 тут стояв cs.pct: у
                незавершеного курсу він завжди 0, тож курс із одним
                складеним модулем із десяти виглядав як незрушений.
                !isActuallyDone, не cs.status !== "completed" (2026-09-18,
                живий скрін користувача): інакше на неузгоджених даних
                (enrollment "completed", але не кожен модуль має власний
                результат) картка ховала прогрес-бар і показувала підсумок
                "Завершено · Незалік", а кнопка нижче (та вже орієнтована
                на isActuallyDone) писала "Продовжити курс" — два різні
                джерела правди суперечили одне одному на тій самій картці. */}
            {!isActuallyDone && hasModules && (
              <div className="ct-progress-row">
                <div className="ct-progress-track">
                  <div className="ct-progress-fill" style={{ width: `${progress.pct}%` }} />
                </div>
                <span className="ct-progress-pct">
                  {progress.passed} з {progress.total}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Підсумок пройденого курсу і сертифікат — ОДИН контейнер, в один
            рівень: результат ("Залік · 100%"), дата завершення й кнопка
            завантаження стосуються одного й того самого факту, і розводити
            їх по різних кутах картки не було сенсу.
            Живе поза .ct-toggle, бо .ct-toggle — <button>, а сертифікат
            теж <button> (вкладати не можна, див. коментар вище). */}
        {isActuallyDone && (
          <div className="ct-done-row">
            <div className="ct-done-main">
              {/* Відсоток лише при заліку — при незаліку він не має сенсу
                  (курс складається помодульно). Золотий кубок — лише за
                  рівно 100% (2026-09-18, рішення користувача): ідеальний
                  результат курсу в цілому, а не окремого модуля (там
                  кубків більше нема — лишились лише check/x SVG), тому
                  емодзі тут, а не в spільній StatusBadge, яку скрізь
                  інде показують і для менш ніж ідеальних результатів. */}
              <StatusBadge passed={Boolean(cs.passed)} icon>
                {cs.passed ? `Залік · ${cs.pct}%${cs.pct === 100 ? " 🏆" : ""}` : "Незалік"}
              </StatusBadge>
              {enrollment?.completedAt && (
                <div className="ct-completed-date">
                  Завершено {new Date(enrollment.completedAt).toLocaleDateString("uk-UA")}
                </div>
              )}
              {/* Курс нижче 100%, але покращувати поки нема чого — пауза
                  перепроходження ще йде. Без цього рядка кнопка просто
                  мовчки перетворювалась на «Відкрити методичку», і було
                  незрозуміло, чому курс на 94% не дає себе перепройти. */}
              {cs.passed && cs.pct !== 100 && !canImproveNow && nextRetakeAt && (
                <div className="ct-completed-date">
                  Покращити результат можна з {nextRetakeAt.toLocaleDateString("uk-UA")}
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
