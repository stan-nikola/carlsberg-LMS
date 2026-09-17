"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronIcon, CertificateIcon, SpinnerIcon } from "@/components/icons";
import { ComponentScreen } from "@/components/CoursePlayer";
import { CoursePlanPanel } from "@/components/CoursePlan";
import { ImageLightbox } from "@/components/ScreenComponents";
import { getLocalDisplayName } from "@/lib/localName";
import { downloadCertificate } from "@/lib/downloadCertificate";
import { isScored } from "@/lib/componentTypes";

/**
 * "Курс-методичка" — читальний режим без тестів/гейтів/геймефікації:
 * показується ЗАМІСТЬ інтерактивного плеєра, коли курс складено на 100%
 * (тоді перепроходити нічого — назавжди) або коли всі модулі складено і
 * жоден зараз не потребує (пере)проходження (lib/courseContent.js
 * getPlayableModules повертає порожній список) — див.
 * app/courses/[slug]/page.js.
 * Мета — швидко підглянути/повторити матеріал, а не пройти курс ще раз:
 * тому тут НЕМАЄ "Далі"/"Назад", НЕМАЄ оцінюваних компонентів (quiz/
 * hotspot) і input (тести й рефлексія тут не потрібні — лише сам
 * матеріал), а решта рендериться в readOnly: акордеони/кроки розкриті,
 * чек-лист і діалог показані повністю, без гейтів і підсвітки «тапни
 * далі». Раніше методичка віддавала ті самі інтерактивні компоненти з
 * гейтами — і читалась як повторне проходження (скарга користувача
 * 2026-09-14).
 */
export function CourseReview({ course, modules, scorePercent, hasEmail = true, plan = null }) {
  const router = useRouter();
  const [zoomImage, setZoomImage] = useState(null);
  // Той самий підхід, що CourseTile.jsx — справжнє ім'я співробітника без
  // email лежить лише в localStorage цього пристрою (сервер його не
  // зберігає), передається як query-параметр разового GET на сертифікат.
  const [certName, setCertName] = useState("");
  useEffect(() => {
    if (!hasEmail) {
      const local = getLocalDisplayName();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (local) setCertName(local);
    }
  }, [hasEmail]);
  // Той самий fetch+blob підхід, що CourseTile.jsx — звичайний <a href>
  // на мобільному/PWA відкривав PDF прямо у вкладці замість завантаження,
  // без жодної навігації назад (реальна скарга користувача).
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

  // Наскрізний номер кроку — чисто функціонально (без мутації лічильника
  // під час рендеру, react-hooks/immutability це забороняє): спочатку
  // плаский список усіх компонентів курсу, потім номер = позиція в ньому.
  const flatComponents = modules.flatMap((courseModule) =>
    courseModule.screens
      .flatMap((screen) => screen.components.filter((c) => !isScored(c) && c.type !== "input"))
      .map((component) => ({ moduleId: courseModule.id, moduleTitle: courseModule.title, component }))
  );
  const moduleGroups = modules
    .map((courseModule) => ({
      id: courseModule.id,
      title: courseModule.title,
      reviewComponents: flatComponents
        .map((item, i) => ({ ...item, stepNumber: i + 1 }))
        .filter((item) => item.moduleId === courseModule.id),
    }))
    .filter((group) => group.reviewComponents.length > 0);

  return (
    // stage--course-player — та сама десктопна ширина/reflow, що й у
    // "живому" CoursePlayer.jsx (globals.css/@container cp-card,
    // course-player.css): "методичка" показує ТОЙ САМИЙ контент курсу,
    // просто без тестів/гейтів, і мала лишатись вузькою мобільною
    // карткою по центру десктопного екрана — реальний баг користувача.
    <div className="stage stage--course-player">
      <div className="course-col">
        <div className="course-card">
          <div className="appbar">
            <button className="iconbtn" aria-label="Назад" onClick={() => router.push("/hub")}>
              <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}>
                <ChevronIcon />
              </span>
            </button>
            <div style={{ flex: 1 }} />
            <span className="cp-step-count">Методичка</span>
          </div>

          <div className="cp-viewport">
            <div className="cp-screen cp-intro">
              <h1 className="cp-h1">{course.title}</h1>
              {course.description && <p className="cp-lead">{course.description}</p>}
              <p className="cp-note">
                {plan && plan.remainingCount > 0
                  ? "Наступний модуль ще закритий — у плані нижче видно, коли він відкриється. Тут лише матеріал уже складених модулів для повторення."
                  : scorePercent === 100
                    ? "Курс складено на 100% — тут лише матеріал для повторення, без тестів і обмежень."
                    : "Усі модулі курсу вже складено — нижче матеріал для повторення, без тестів і обмежень. Модуль, складений не на 100%, можна перепройти з тестами прямо з плану курсу."}
              </p>
              {/* План з кнопками «Перепройти» — раніше методичка лише
                  обіцяла, що модуль «колись знову з'явиться в плеєрі», і
                  зайти в конкретний модуль було нічим. */}
              {plan && <CoursePlanPanel plan={plan} slug={course.slug} />}
              {scorePercent === 100 ? (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadCertificate}
                    disabled={certDownloading}
                    className="ct-certificate-link"
                  >
                    {certDownloading ? <SpinnerIcon /> : <CertificateIcon />}
                    <span>Завантажити сертифікат</span>
                  </button>
                  {certDownloadError && <p className="cp-note ct-certificate-error">{certDownloadError}</p>}
                </>
              ) : (
                <p className="cp-note cp-certificate-hint">
                  <CertificateIcon />
                  <span>Перепройдіть слабший модуль на 100% — і отримаєте сертифікат за курс!</span>
                </p>
              )}
            </div>

            {moduleGroups.map((group) => (
              <div key={group.id} className="cp-screen">
                <h2 className="cp-h2">{group.title}</h2>
                {group.reviewComponents.map(({ component, stepNumber }) => (
                  <div className="screen-component" key={component.id}>
                    <ComponentScreen component={component} screenNumber={stepNumber} onZoomImage={setZoomImage} readOnly />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {zoomImage && <ImageLightbox src={zoomImage.src} alt={zoomImage.alt} onClose={() => setZoomImage(null)} />}
    </div>
  );
}
