"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronIcon, CertificateIcon } from "@/components/icons";
import { ComponentScreen } from "@/components/CoursePlayer";
import { ImageLightbox } from "@/components/ScreenComponents";

/**
 * "Курс-методичка" — читальний режим без тестів/гейтів/геймефікації:
 * показується ЗАМІСТЬ інтерактивного плеєра, коли всі модулі курсу вже
 * складено і жоден зараз не потребує (пере)проходження
 * (lib/courseContent.js getPlayableModules повертає порожній список).
 * Мета — швидко підглянути/повторити матеріал, а не пройти курс ще раз:
 * тому тут НЕМАЄ "Далі"/"Назад", НЕМАЄ quiz/input компонентів (тести й
 * рефлексія тут не потрібні — лише сам матеріал), просто суцільний
 * скрол по всьому контенту курсу, згрупований по модулях.
 */
export function CourseReview({ course, modules, scorePercent }) {
  const router = useRouter();
  const [zoomImage, setZoomImage] = useState(null);

  // Наскрізний номер кроку — чисто функціонально (без мутації лічильника
  // під час рендеру, react-hooks/immutability це забороняє): спочатку
  // плаский список усіх компонентів курсу, потім номер = позиція в ньому.
  const flatComponents = modules.flatMap((courseModule) =>
    courseModule.screens
      .flatMap((screen) => screen.components.filter((c) => c.type !== "quiz" && c.type !== "input"))
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
    <div className="stage">
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
                Усі модулі курсу вже складено — тут лише матеріал для повторення, без тестів і обмежень. Щоб
                перепройти конкретний модуль ще раз (з тестами), поверніться пізніше — після паузи повторного
                проходження він знову з&apos;явиться в плеєрі.
              </p>
              {scorePercent === 100 ? (
                <a href={`/api/courses/${course.slug}/certificate`} className="ct-certificate-link">
                  <CertificateIcon />
                  <span>Завантажити сертифікат</span>
                </a>
              ) : (
                <p className="cp-note cp-certificate-hint">
                  🏆 Перепройдіть слабший модуль на 100%, щоб отримати сертифікат за курс!
                </p>
              )}
            </div>

            {moduleGroups.map((group) => (
              <div key={group.id} className="cp-screen">
                <h2 className="cp-h2">{group.title}</h2>
                {group.reviewComponents.map(({ component, stepNumber }) => (
                  <div className="screen-component" key={component.id}>
                    <ComponentScreen component={component} screenNumber={stepNumber} onZoomImage={setZoomImage} />
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
