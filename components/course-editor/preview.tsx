"use client";

import { useEffect, useRef, useState, type CSSProperties, type ComponentType, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ComponentScreen, QuizScreen, CoursePlayer, HotspotScreen } from "@/components/course-editor/playerScreens";
import { OrderingScreen, MatchingScreen } from "@/components/QuestionScreens";
import { ChevronIcon, XIcon } from "@/components/icons";
import { isScored } from "@/lib/componentTypes";
import { moduleCooldownDays } from "@/lib/coursePlan";
import { useDismiss } from "@/lib/useDismiss";
import type { EditorCourse, LiveComponent } from "@/components/course-editor/types";

/** Пропси «екрана» прев'ю — однакові для докнутого мокапа і модалки. */
type PreviewProps = {
  components: LiveComponent[];
  componentNumbers?: Map<number, number>;
  stepNumber: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  canGoBack: boolean;
  canGoNext: boolean;
};

/** --cp-zoom для мокапа: CSS-змінна, якої немає в CSSProperties. */
const zoomStyle = (zoom: number | null) => (zoom ? ({ "--cp-zoom": zoom } as CSSProperties) : undefined);

/** Права колонка — жива прев'ю обраного екрану З ТИМ САМИМ "хромом", що
 * й реальний CoursePlayer (шапка з лічильником кроку, прогрес-бар, кнопки
 * навігації внизу — components/CoursePlayer.jsx) — не просто вміст
 * екрану, а точний вигляд того, що побачить співробітник у застосунку.
 * Кнопки "Назад"/"Далі" тут керують ТИМ САМИМ обраним екраном, що й ліва
 * колонка (onBack/onNext), — прев'ю справді "гортається" так само. */
/**
 * Рамка iPhone 17 Pro Max (space black) — SVG зі СПРАВЖНІМ прозорим
 * вирізом під контент (mask: зовнішній контур мінус внутрішній rect), не
 * намальований сірий бордюр. Dynamic Island — окрема заповнена форма
 * ПОВЕРХ контенту (шар вище за .course-card), точно як на реальному
 * пристрої. viewBox 300×650 навмисно дає рівно 9:19.5 — координати
 * узгоджені з inset у .iphone-mockup .course-card (app/styles/admin.css).
 */
function IPhoneFrame() {
  return (
    <svg className="iphone-mockup-frame" viewBox="0 0 300 650" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <mask id="iphoneRingMask">
          <rect x="0" y="0" width="300" height="650" rx="58" fill="#fff" />
          <rect x="7" y="7" width="286" height="636" rx="51" fill="#000" />
        </mask>
      </defs>
      <rect x="0" y="0" width="300" height="650" rx="58" fill="#000000" mask="url(#iphoneRingMask)" />
      <rect x="0.5" y="0.5" width="299" height="649" rx="58" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      {/* Dynamic Island — над контентом, не виріз у рамці */}
      <rect x="115" y="25" width="70" height="21" rx="10.5" fill="#05070a" />
      {/* Бокові клавіші — суто декоративні */}
      <rect x="-3" y="150" width="3" height="42" rx="1.5" fill="#000000" />
      <rect x="-3" y="205" width="3" height="42" rx="1.5" fill="#000000" />
      <rect x="300" y="165" width="3" height="60" rx="1.5" fill="#000000" />
    </svg>
  );
}

/**
 * Рамка ноутбука (той самий mask-прийом, що й IPhoneFrame — суцільна форма
 * мінус прозорий виріз під контент). viewBox навмисно ширший за саму
 * "кришку" (-30..1030 замість 0..1000) — база клавіатури свідомо ширша за
 * екран (справжня пропорція лаптопа), і зайвий простір ліворуч/праворуч
 * саме під це. Координати вирізу (20,20)-(980,540) узгоджені з inset у
 * .laptop-mockup .course-card (app/styles/admin.css) так само, як для
 * iPhone.
 *
 * Нижня частина (шарнір+база клавіатури, усе нижче y=560) зменшена на 30%
 * за проханням користувача — було 640 повної висоти (80px "хвоста" під
 * екраном), стало 608 (56px): та сама пропорція шарніра/бази/виїмки,
 * просто масштабована ×0.7 відносно лінії y=560, де закінчується сам
 * екран. Це й зменшує загальну висоту рамки (менше "зайвого" знизу), і
 * прямо допомагає з переповненням вьюпорту (нижче, .laptop-mockup) —
 * коротша рамка при тій самій ширині фізично нижча.
 */
function LaptopFrame() {
  return (
    <svg className="laptop-mockup-frame" viewBox="-30 0 1060 608" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <mask id="laptopScreenMask">
          <rect x="0" y="0" width="1000" height="560" rx="26" fill="#fff" />
          <rect x="20" y="20" width="960" height="520" rx="12" fill="#000" />
        </mask>
      </defs>
      {/* Кришка з екраном */}
      <rect x="0" y="0" width="1000" height="560" rx="26" fill="#1d1d1f" mask="url(#laptopScreenMask)" />
      <rect x="0.5" y="0.5" width="999" height="559" rx="26" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
      {/* Камера */}
      <circle cx="500" cy="12" r="3.2" fill="#05070a" />
      {/* Шарнір */}
      <rect x="60" y="561.4" width="880" height="7" rx="3" fill="#2a2a2d" />
      {/* База клавіатури — ширша за екран, з виїмкою під трекпад спереду */}
      <rect x="-25" y="572.6" width="1050" height="35" rx="7" fill="#3a3a3d" />
      <rect x="410" y="572.6" width="180" height="5.6" rx="2.8" fill="#1d1d1f" opacity="0.5" />
    </svg>
  );
}

function LaptopDeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="1.3" />
      <line x1="1" y1="20" x2="23" y2="20" />
    </svg>
  );
}

/** Логічна ширина екрана, яку емулюють ОБИДВА телефонних прев'ю —
 *  справжній iPhone Pro Max (440×956 CSS px). Рішення користувача
 *  2026-09-23: докнуте прев'ю й модалка мають показувати ОДНУ І ТУ САМУ
 *  верстку з однаковими переносами рядків, і саме ту, яку побачить
 *  співробітник; відрізнятись вони можуть лише фізичним розміром картинки. */
const PHONE_SCREEN_W = 440;

/**
 * Зум, при якому екран усередині рамки має рівно PHONE_SCREEN_W логічних
 * пікселів — хай якого фізичного розміру вийшла сама рамка.
 *
 * Чому не фіксоване число в CSS (було zoom:0.7 у докнутому і 1 у модалці):
 * рамка масштабується під доступне місце (ширина колонки / висота вікна),
 * тож при СТАЛОМУ зумі логічна ширина екрана "плаває" разом з нею — на
 * одному й тому ж проєкті виходило 513px у докнутому прев'ю й 356px у
 * модалці, і жодне з них не дорівнювало справжньому телефону (скарга
 * користувача: контент у модалці влазить зовсім не так, як у прев'ю).
 * CSS порахувати це не може: потрібне ділення довжини на довжину.
 *
 * Міряємо елемент, на якому САМЕ І СТОЇТЬ зум, і множимо його offsetWidth
 * на вже застосований зум (читаємо з DOM, а не зі стейту — так значення
 * гарантовано узгоджені між собою): offsetWidth у зумленого елемента вже
 * поділений на його зум, тож добуток — це справжня ширина в координатах
 * розкладки. Вимірювання не зациклюється: щойно зум правильний, добуток
 * перестає мінятись.
 */
function usePhoneScreenZoom(mockupRef: RefObject<HTMLElement | null>, selector: string, enabled: boolean) {
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    const el = enabled ? mockupRef.current?.querySelector<HTMLElement>(selector) : null;
    if (!el) return undefined;
    const measure = () => {
      const applied = parseFloat(getComputedStyle(el).zoom) || 1;
      const real = el.offsetWidth * applied;
      if (real <= 0) return;
      const next = real / PHONE_SCREEN_W;
      // Мертва зона обов'язкова: offsetWidth цілочисельний, тож добуток
      // щоразу гуляє на ±1px, новий зум трохи інший — і ResizeObserver
      // будив би сам себе нескінченно (перевірено на замірах: 0.709 →
      // 0.707 → …). 0.5% — дрібніше за півпікселя на екрані.
      setZoom((prev) => (prev && Math.abs(prev - next) < 0.005 ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mockupRef, selector, enabled]);
  return zoom;
}

/**
 * Клік по сірому тлу модалки закриває прев'ю, клік по самому пристрою — ні.
 *
 * Перевіряємо саме "чи це всередині рамки", а НЕ `e.target === e.currentTarget`
 * (як було): оверлей повністю перекритий двома розтягнутими на 100%
 * обгортками (.admin-preview-modal → -body), тож ціллю кліку по сірому
 * завжди була одна з НИХ, а не сам оверлей — і закриття не спрацьовувало
 * ніколи (скарга користувача 2026-09-23). Селектор по мокапу, а не по
 * .course-card: рамка пристрою й плашка прев'ю — теж "сам пристрій",
 * випадковий клік по них не має закривати вікно.
 */
const closeOnBackdrop = (onClose: () => void) => (e: React.MouseEvent) => {
  if (!(e.target as HTMLElement).closest(".iphone-mockup, .laptop-mockup")) onClose();
};

/**
 * Сам вміст мокапу — .course-card (шапка/прогрес/контент/навігація) +
 * SVG-рамка, спільні для ДОКНУТОГО телефонного прев'ю (завжди на екрані,
 * поруч з редактором) і повноекранної модалки (components нижче) —
 * інакше довелось би тримати той самий JSX у двох місцях. device —
 * "phone"|"laptop", вирішує лише яка обгортка/рамка рендериться, самі
 * пропси екрана (components/stepNumber/onBack/...) не залежать від
 * пристрою.
 */
function DeviceMockup({
  device,
  components,
  componentNumbers,
  stepNumber,
  totalSteps,
  onBack,
  onNext,
  canGoBack,
  canGoNext,
  inModal,
  onClose,
}: PreviewProps & { device: string; inModal?: boolean; onClose?: () => void }) {
  const hasScreen = components && components.length > 0;
  // Той самий скрол-контейнер, що й у реальному плеєрі (.cp-viewport) — той
  // самий фікс: без явного скидання наступний екран у прев'ю відкривався
  // "з середини", якщо попередній був прогорнутий вниз.
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [stepNumber]);
  const isLaptop = device === "laptop";
  // inModal — телефон У МОДАЛЦІ навмисно БІЛЬШИЙ за докнуту версію (за
  // проханням користувача "увеличь ее в размер вьюпорта"): докнута версія
  // навмисно тримається реалістичної щільності маленького екрана (formula
  // в .iphone-mockup), а в повноекранній модалці для цього немає причин —
  // там, як і для ноутбука, варто реально заповнити виділений простір.
  // Модифікатор-клас (.iphone-mockup--modal), а не інший формула прямо тут,
  // щоб .cp-zoom-wrap-щільність (app/styles/admin.css) лишалась спільною.
  const mockupClass = isLaptop ? "laptop-mockup" : inModal ? "iphone-mockup iphone-mockup--modal" : "iphone-mockup";
  const mockupRef = useRef<HTMLDivElement>(null);
  const screenZoom = usePhoneScreenZoom(mockupRef, ".cp-zoom-wrap", !isLaptop);
  return (
    <div className={mockupClass} ref={mockupRef} style={zoomStyle(screenZoom)}>
      {/* Хрестик — ДИТИНА мокапа, а не модалки: лише так він стоїть біля
          самої рамки пристрою (мокап центрований і має власну ширину, тож
          кут модалки від нього за сотні пікселів). */}
      {onClose && (
        <button type="button" className="iconbtn admin-preview-modal-close" onClick={onClose} aria-label="Закрити прев'ю" title="Закрити">
          <XIcon />
        </button>
      )}
      <div className="course-card">
        {/* Окрема обгортка, а не zoom напряму на .course-card — .course-card
            сам позиціонується через position:absolute+inset% відносно
            рамки (iphone-mockup/laptop-mockup), і саме ЦІ percentage-
            обчислення мають лишитись у "реальних" (незумлених) координатах
            рамки; zoom тут скоуплено лише на дитину, що вже отримала свій
            розмір (height:100% від .course-card, обчислений ДО зуму) —
            тож сама коробка не змінюється, лише контент усередині
            рендериться дрібніше/щільніше (app/styles/admin.css). */}
        <div className="cp-zoom-wrap">
        <div className="appbar">
          <button type="button" className="iconbtn" onClick={onBack} disabled={!canGoBack} aria-label="Назад" title="Попередній екран у прев'ю">
            <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}>
              <ChevronIcon />
            </span>
          </button>
          <div style={{ flex: 1 }} />
          {hasScreen && (
            <span className="cp-step-count">
              {stepNumber}/{totalSteps}
            </span>
          )}
        </div>
        {hasScreen && (
          <div className="cp-progress-track">
            <div className="cp-progress-fill" style={{ width: `${Math.round((stepNumber / totalSteps) * 100)}%` }} />
          </div>
        )}

        <div className="cp-viewport" ref={viewportRef}>
          {!hasScreen ? (
            <p className="admin-preview-empty">Оберіть екран зліва, щоб побачити прев&apos;ю.</p>
          ) : (
            <div className="cp-screen">
              {components.map((component) => (
                <div className="screen-component" key={component.id}>
                  {/* Оцінювані типи (quiz, hotspot) тримають локальну відповідь у
                      PreviewQuiz; ComponentScreen для hotspot кейса не має і
                      малював би його як звичайний інфо-екран без зон. */}
                  {isScored(component) ? (
                    <PreviewQuiz component={component} screenNumber={componentNumbers?.get(component.id) ?? stepNumber} />
                  ) : (
                    // Той самий диспетчер, що й у плеєрі — інтерактивні екрани в
                    // прев'ю справді клікаються (картки розгортаються, репліки
                    // з'являються), щоб автор одразу перевірив механіку, а не
                    // здогадувався по полях форми. key — щоб при перемиканні
                    // типу внутрішній стан взаємодії починався з нуля.
                    // Номер у кикері — наскрізний по компонентах (1, 2, 3…), як у
                    // реальному плеєрі, а не номер екрана: два блоки на одному
                    // екрані показували б однакову «1».
                    <ComponentScreen
                      key={`${component.id}-${component.type}`}
                      component={component}
                      screenNumber={componentNumbers?.get(component.id) ?? stepNumber}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {hasScreen && (
          <div className="navwrap">
            <div className="navbar">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onBack}
                style={{ visibility: canGoBack ? "visible" : "hidden" }}
                title="Попередній екран у прев'ю"
              >
                Назад
              </button>
              <button type="button" className="btn btn-primary" onClick={onNext} disabled={!canGoNext} title="Наступний екран у прев'ю">
                Далі
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
      {isLaptop ? <LaptopFrame /> : <IPhoneFrame />}
    </div>
  );
}

/**
 * Права колонка. Докнутий інлайн-мокап — ЗАВЖДИ телефон (єдиний формат,
 * що реально влазить у фіксовану 40%-колонку поруч із редактором, не
 * ламаючись і не обрізаючись) — ноутбук у ту саму колонку МЕХАНІЧНО не
 * влазить (ширший за пропорцією, довший рядок тексту), тому для нього
 * (і за бажанням для телефону теж, кнопкою "На весь екран") прев'ю
 * відкривається в модалці на весь екран, де під пристрій реально є
 * місце — той самий підхід, що Webflow/Framer ("Preview" відкриває
 * повноекранний режим, а не намагається влізти в бокову панель).
 */
/**
 * Повне проходження курсу в прев'ю — той самий CoursePlayer, що бачить
 * співробітник, від вступного екрана до фінального з конфеті й
 * сертифікатом. previewMode вимикає БУДЬ-ЯКИЙ запис: ні submit, ні
 * module-complete, ні localStorage (ключ прогресу там спільний зі
 * справжнім курсом — без цього автор затирав би власний реальний прогрес).
 *
 * Портал у document.body — з тієї самої причини, що й у модалки прев'ю
 * нижче: .adm-shell несе zoom:85% на все піддерево, і vh-розрахунки
 * всередині нього тихо стискаються.
 */
export function CourseRunPreview({ course, onClose }: { course: EditorCourse; onClose: () => void }) {
  // Компонент монтується лише коли прев'ю відкрите.
  useDismiss(onClose);
  const mockupRef = useRef<HTMLDivElement>(null);
  const screenZoom = usePhoneScreenZoom(mockupRef, ".course-card", course.previewDevice !== "laptop");

  // Той самий плаский список екранів, що будує сторінка курсу
  // (app/courses/[slug]/page.js) — плеєр очікує саме таку форму.
  const screens = (course.modules || []).flatMap((m) =>
    (m.screens || []).map((s) => ({
      id: s.id,
      title: s.title,
      moduleId: m.id,
      moduleTitle: m.title,
      components: s.components || [],
    }))
  );

  return createPortal(
    <div className="admin-preview-modal-overlay" onClick={closeOnBackdrop(onClose)}>
      <div className="admin-preview-modal">
        <div className="admin-preview-modal-body">
          {/* Тут зум стоїть на самій .course-card (її приносить CoursePlayer,
              власної обгортки-зума в нього нема) — перевірено, що zoom на
              абсолютно позиціонованій картці НЕ ламає ні її розмір, ні
              положення в рамці: відсотки inset резолвляться до зуму. */}
          <div
            ref={mockupRef}
            style={zoomStyle(screenZoom)}
            className={`${course.previewDevice === "laptop" ? "laptop-mockup" : "iphone-mockup"} iphone-mockup--modal adm-run-preview`}
          >
            {/* Хрестик усередині мокапа — біля самої рамки, не в куті екрана
                (те саме, що й у DeviceMockup вище). */}
            <button type="button" className="iconbtn admin-preview-modal-close" onClick={onClose} aria-label="Закрити прев'ю" title="Закрити">
              <XIcon />
            </button>
            <div className="adm-run-preview-badge">Прев&apos;ю — результати не зберігаються</div>
            {screens.length === 0 ? (
              <p className="admin-hint" style={{ padding: 20 }}>У курсі ще немає жодного екрана.</p>
            ) : (
              <CoursePlayer
                previewMode
                course={{
                  id: course.id,
                  slug: course.slug,
                  title: course.title,
                  description: course.description,
                  streakMessages: course.streakMessages,
                  passThreshold: course.passThreshold,
                  certificateEnabled: course.certificateEnabled,
                }}
                screens={screens}
                enrollmentId={null}
                moduleCooldowns={Object.fromEntries((course.modules || []).map((m) => [m.id, moduleCooldownDays(course, m)]))}
              />
            )}
            {/* Та сама рамка пристрою, що й у докнутому мокапі (DeviceMockup) —
                без неї прев’ю виглядало голою білою карткою (2026-09-15). */}
            {course.previewDevice === "laptop" ? <LaptopFrame /> : <IPhoneFrame />}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ComponentPreview({
  previewDevice,
  onRunCourse,
  ...previewProps
}: PreviewProps & { previewDevice: string; onRunCourse: () => void }) {
  const [modalOpen, setModalOpen] = useState(false);
  const isLaptop = previewDevice === "laptop";
  // Esc закриває модалку, сторінка редактора під нею не скролиться.
  useDismiss(() => setModalOpen(false), modalOpen);

  // Було: авто-відкриття модалки одразу, щойно isLaptop===true — за
  // словами користувача, це означало, що модалка вилазила ВІДРАЗУ при
  // самому вході в конструктор ноутбук-курсу, ще до будь-якої дії адміна —
  // неочікуваний "сюрприз-модал". Тепер модалка відкривається ЛИШЕ явним
  // кліком (кнопка нижче), як і для телефону.

  return (
    <div className="admin-editor-preview">
      {/* Без мітки платформи й без перемикача — платформа обирається ОДИН
          РАЗ у "Загальна інформація" (components/AdminDashboard.jsx,
          Course.previewDevice), тут просто мокап відповідного пристрою,
          за проханням користувача, без зайвого напису над ним. */}
      {isLaptop ? (
        // Ноутбук ніколи не докується інлайн (саме це "не вміщалось
        // нормально") — сама колонка тепер лише 10% ширини
        // (.admin-editor-grid.is-laptop-preview), тож замість цілого
        // плейсхолдера з іконкою й абзацом тексту — компактна кнопка,
        // яка й так туди не влізла б.
        <button
          type="button"
          className="iconbtn admin-laptop-preview-btn"
          onClick={() => setModalOpen(true)}
          title="Відкрити прев'ю ноутбука на весь екран"
          aria-label="Відкрити прев'ю ноутбука на весь екран"
        >
          <LaptopDeviceIcon />
        </button>
      ) : (
        <>
          <DeviceMockup device="phone" {...previewProps} />
          <div className="admin-row admin-preview-actions">
            <button type="button" className="admin-btn-link admin-preview-expand-btn" onClick={() => setModalOpen(true)}>
              ⛶ На весь екран
            </button>
            {/* Повне проходження від вступу до сертифіката — щоб автор
                побачив те саме, що й співробітник, а не окремі екрани. */}
            <button
              type="button"
              className="admin-btn-link"
              onClick={onRunCourse}
              title="Пройти курс цілком, як співробітник — без збереження результатів"
            >
              ▶ Пройти курс
            </button>
          </div>
        </>
      )}

      {/* createPortal у document.body, не звичайний вкладений JSX — .adm-shell
          (components/AdminShell.jsx) несе zoom:85% на весь свій піддерево
          (навмисно, компенсує розмір тексту адмінки), і position:fixed
          НЕ рятує від успадкованого zoom — усі vh-розрахунки модалки
          (.laptop-mockup/.iphone-mockup--modal, app/styles/admin.css)
          тихо рахувались у вже стиснутих на 15% координатах, тому модалка
          щоразу виходила меншою за розрахунок (реальний баг користувача,
          не вигадана обережність) — так само, як .adm-shell сам собі
          компенсує це через calc(100vh/0.85) для min-height. Портал
          повністю виносить DOM-вузол модалки з-під того zoom, тож 100vh
          усередині — це справді 100vh. */}
      {modalOpen &&
        createPortal(
          <div className="admin-preview-modal-overlay" onClick={closeOnBackdrop(() => setModalOpen(false))}>
            <div className="admin-preview-modal">
              <div className="admin-preview-modal-body">
                <DeviceMockup device={previewDevice} inModal onClose={() => setModalOpen(false)} {...previewProps} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/** Обгортка над QuizScreen з власним локальним станом відповіді — щоб
 * прев'ю в /admin можна було "клікнути" так само, як побачить співробітник,
 * не чіпаючи реальний Enrollment. */
function PreviewQuiz({ component, screenNumber }: { component: LiveComponent; screenNumber: number }) {
  const [answer, setAnswer] = useState<unknown>(undefined);
  // Скидаємо відповідь у прев'ю щоразу, як екран/його вміст змінюється —
  // ефект, а не похідний стан, бо триґериться і зі стабільним component.id
  // (правки контенту вживу), не тільки при зміні обраного екрана.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setAnswer(undefined), [component.id, component.content]);
  const Screen: ComponentType<any> =
    component.type === "hotspot"
      ? HotspotScreen
      : component.type === "ordering"
        ? OrderingScreen
        : component.type === "matching"
          ? MatchingScreen
          : QuizScreen;
  // key по вмісту — щоб перемішування варіантів/кроків перерахувалось,
  // коли автор правит список: інакше прев'ю показувало б старий порядок.
  return (
    <Screen
      key={JSON.stringify(component.content)}
      component={component}
      screenNumber={screenNumber}
      answer={answer}
      onAnswer={setAnswer}
    />
  );
}
