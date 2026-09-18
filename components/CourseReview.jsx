"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronIcon } from "@/components/icons";
import { ComponentScreen } from "@/components/CoursePlayer";
import { ImageLightbox } from "@/components/ScreenComponents";
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
 *
 * Ані завантаження сертифіката, ані повна картка плану тут більше не
 * показуються (2026-09-18, скарга користувача на зайвий вміст між
 * вступною заміткою і самим матеріалом) — сертифікат уже є на картці
 * курсу (CourseTile.jsx), яка привела людину сюди. Замість плану —
 * панель модулів (.mr-tabbar, ПОЗА скрол-зоною .cp-viewport — фіксована,
 * завжди видна): кружечки з номером модуля (без назв тем — 2026-09-19,
 * запит користувача: курс уже прочитаний, орієнтир лише "на якому я
 * модулі"; назва лишається доступною як aria-label для читалок екрана),
 * клік плавно скролить ДО матеріалу модуля нижче на цій самій сторінці
 * (справжня навігація в плеєр тут не потрібна — усе вже прочитане).
 * Розкладка залежить від ширини (`.mr-body`, @container cp-card,
 * min-width:640px — той самий поріг, що й скрізь у плеєрі): мобільно —
 * вертикальна рейка ЗЛІВА від контенту (2026-09-18, скарга користувача:
 * горизонтальна смуга знизу на телефоні виявилась гіршою за просту
 * рейку — повернули); десктоп — горизонтальна панель ЗНИЗУ, список
 * модулів по центру, кнопка "нагору" — справа.
 */
export function CourseReview({ course, modules, plan = null, scorePercent, backHref = "/hub/learn" }) {
  const router = useRouter();
  const [zoomImage, setZoomImage] = useState(null);
  const viewportRef = useRef(null);

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

  // Реальний статус модуля (складено/провалено) — з того самого плану,
  // що вже прийшов пропсом, а не нова вибірка: lib/coursePlan.ts вже
  // порахував це один раз, дублювати підрахунок тут сенсу нема.
  const statusById = new Map((plan?.modules ?? []).map((m) => [m.id, m.status]));

  // Активна вкладка — не лише результат кліку, а й "де я зараз" під час
  // звичайного скролу (2026-09-18, запит користувача): IntersectionObserver
  // стежить за модулями в межах вузької смуги біля верху видимої області
  // (rootMargin), а не "будь-де видно" — інакше в довгому модулі активними
  // ставали б одразу кілька вкладок.
  const [activeId, setActiveId] = useState(null);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || moduleGroups.length <= 1) return undefined;
    const targets = moduleGroups.map((g) => document.getElementById(`cp-module-${g.id}`)).filter(Boolean);
    if (targets.length === 0) return undefined;

    const moduleOrder = new Map(moduleGroups.map((g, i) => [g.id, i]));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        // На швидкому скролі сусідні модулі можуть на мить ОБИДВА
        // потрапити в один пакет entries як isIntersecting:true (той, що
        // йде геть, ще не встиг вийти з вузької смуги rootMargin, поки
        // наступний уже ввійшов) — сортування за boundingClientRect.top
        // тоді хибно обирало модуль, що вже майже пішов угору за екран
        // (від'ємний top переміг би), і оскільки IntersectionObserver
        // надсилає лише ЗМІНИ статусу, наступний пакет (де цей модуль
        // нарешті виходить) міг не містити жодного isIntersecting:true
        // взагалі — activeId лишався "застряглим" на невірному модулі
        // (виявлено 2026-09-19 через нову синю рамку — раніше кільце було
        // непомітним, і застрягання просто не впадало в очі). Тепер серед
        // кількох одночасно "видимих" береться НАЙПІЗНІШИЙ за порядком
        // модулів курсу, а не найменший піксельний top.
        const bestId = visible.reduce((best, e) => {
          const id = Number(e.target.id.replace("cp-module-", ""));
          return best === null || moduleOrder.get(id) > moduleOrder.get(best) ? id : best;
        }, null);
        setActiveId(bestId);
      },
      { root: viewport, rootMargin: "-10% 0px -70% 0px", threshold: 0 }
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- moduleGroups похідне від modules, стабільний ключ саме він
  }, [modules]);

  // Синє кільце "я тут" — ОКРЕМИЙ елемент (.mr-tab-ring), що ковзає
  // transform-ом до активного кружечка, а не власний box-shadow на кожній
  // кнопці: так кільце фізично "переїжджає" з одного номера на інший і при
  // кліку по рейці, і при звичайному скролі вмісту (2026-09-19, запит
  // користувача). Позиція — offsetLeft/offsetTop кружечка відносно
  // .mr-tabbar-list (position:relative, той самий offsetParent) — це
  // рахується від повного вмісту, а не видимої області, тож саме собою
  // враховує внутрішній скрол рейки (overflow-y/-x:auto на ній), без ручної
  // компенсації scrollTop/scrollLeft.
  const tabListRef = useRef(null);
  const tabRefs = useRef(new Map());
  const ringRef = useRef(null);
  const prevActiveIdRef = useRef(null);

  function positionRing(mode) {
    const ring = ringRef.current;
    if (!ring) return;
    const btn = activeId != null ? tabRefs.current.get(activeId) : null;
    const num = btn?.querySelector(".mr-tab-num");
    if (!num) {
      ring.style.opacity = "0";
      return;
    }
    // "snap" (ресайз/зміна орієнтації мобільна/десктопна) — без анімації
    // взагалі, "appear" (кільце щойно стало видимим уперше — на вступному
    // екрані активного модуля ще нема) — без "з'їзду" з кута, лише плавна
    // поява на вже правильному місці. Звичайний клік/скрол лишає CSS-
    // transition із стилів (transition:"") — саме тоді кільце "їде".
    if (mode === "snap") ring.style.transition = "none";
    else if (mode === "appear") ring.style.transition = "opacity 0.15s ease";
    ring.style.transform = `translate(${num.offsetLeft}px, ${num.offsetTop}px)`;
    ring.style.opacity = "1";
    if (mode !== "animate") {
      // Форсований reflow: застосувати нову позицію БЕЗ transition, перш ніж повернути його назад.
      void ring.offsetWidth;
      ring.style.transition = "";
    }
  }

  useLayoutEffect(() => {
    const isFirstAppearance = prevActiveIdRef.current == null && activeId != null;
    positionRing(isFirstAppearance ? "appear" : "animate");
    prevActiveIdRef.current = activeId;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- positionRing читає activeId із замикання, додавати її саму в залежності не треба
  }, [activeId]);

  useEffect(() => {
    const list = tabListRef.current;
    if (!list || moduleGroups.length <= 1) return undefined;
    const observer = new ResizeObserver(() => positionRing("snap"));
    observer.observe(list);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- та сама причина, що вище
  }, [modules]);

  function scrollToModule(id) {
    // НЕ target.scrollIntoView() — на реальному iPhone Safari сама вирішує,
    // який зі скрол-предків прокрутити, і при цій вкладеності (.cp-viewport
    // усередині .mr-body усередині .course-card) іноді прокручує ЗОВНІШНЮ
    // сторінку замість .cp-viewport: .appbar (сусід .mr-body, поза зоною
    // скролу) тоді їде вгору разом із контентом і не повертається (скарга
    // користувача, 2026-09-19). Пряме scrollTo на ВІДОМОМУ контейнері,
    // рахуючи offsetTop цілі відносно нього (.cp-viewport — position:relative,
    // той самий offsetParent), прибирає цю неоднозначність повністю.
    const viewport = viewportRef.current;
    const target = document.getElementById(`cp-module-${id}`);
    if (!viewport || !target) return;
    viewport.scrollTo({ top: target.offsetTop, behavior: "smooth" });
  }
  function scrollToTop() {
    viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

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
            <button className="iconbtn" aria-label="До списку курсів" onClick={() => router.push(backHref)}>
              <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}>
                <ChevronIcon />
              </span>
            </button>
            <div style={{ flex: 1 }} />
            <span className="cp-step-count">Методичка</span>
          </div>

          <div className="mr-body">
            <div className="cp-viewport" ref={viewportRef}>
              <div className="cp-screen cp-intro">
                <h1 className="cp-h1">{course.title}</h1>
                {course.description && <p className="cp-lead">{course.description}</p>}
                <p className="cp-note">
                  {plan && plan.remainingCount > 0
                    ? "Наступний модуль ще закритий. Тут лише матеріал уже складених модулів для повторення."
                    : scorePercent === 100
                      ? "Курс складено на 100% — тут лише матеріал для повторення, без тестів і обмежень."
                      : "Усі модулі курсу вже складено — нижче матеріал для повторення, без тестів і обмежень. Слабший модуль можна перепройти з тестами зі сторінки курсу."}
                </p>
              </div>

              {moduleGroups.map((group) => (
                <div key={group.id} id={`cp-module-${group.id}`} className="cp-screen">
                  <h2 className="cp-h2">{group.title}</h2>
                  {group.reviewComponents.map(({ component, stepNumber }) => (
                    <div className="screen-component" key={component.id}>
                      <ComponentScreen component={component} screenNumber={stepNumber} onZoomImage={setZoomImage} readOnly />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Порядок DOM навмисний: спершу список, тоді кнопка "нагору" —
                у мобільній колонці (rail зліва) кнопка тоді останньою й
                опиняється внизу, у десктопному рядку (панель знизу) вона
                останньою опиняється справа. Саме так, без CSS order,
                виконуються ОБИДВІ вимоги користувача одразу (2026-09-18:
                "кнопку вгору... справа" на десктопі, "...внизу" на
                мобільному) — .mr-body нижче лише розвертає РЯДОК/КОЛОНКУ
                на @container-порозі, положення кнопки в межах панелі не
                чіпає. */}
            {moduleGroups.length > 1 && (
              <nav className="mr-tabbar" aria-label="Модулі курсу">
                <div className="mr-tabbar-list" ref={tabListRef}>
                  {moduleGroups.map((group, i) => (
                    <button
                      key={group.id}
                      type="button"
                      ref={(el) => {
                        if (el) tabRefs.current.set(group.id, el);
                        else tabRefs.current.delete(group.id);
                      }}
                      className={`mr-tab is-${statusById.get(group.id) || "locked"}${activeId === group.id ? " is-active" : ""}`}
                      onClick={() => scrollToModule(group.id)}
                      aria-label={`Модуль ${i + 1}: ${group.title}`}
                    >
                      <span className="mr-tab-num" aria-hidden="true">
                        {i + 1}
                      </span>
                    </button>
                  ))}
                  <span className="mr-tab-ring" ref={ringRef} aria-hidden="true" />
                </div>
                <button type="button" className="mr-tabbar-top" onClick={scrollToTop} aria-label="Нагору">
                  <span style={{ transform: "rotate(-90deg)", display: "inline-flex" }}>
                    <ChevronIcon />
                  </span>
                </button>
              </nav>
            )}
          </div>
        </div>
      </div>

      {zoomImage && <ImageLightbox src={zoomImage.src} alt={zoomImage.alt} onClose={() => setZoomImage(null)} />}
    </div>
  );
}
