"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { pluralize } from "@/lib/pluralize";
import { numberComponents } from "@/lib/coursePlayerLogic";
import { LoadingLine } from "@/components/Skeleton";
import { saveOrder, useIdOrder } from "@/lib/useIdOrder";
import { api } from "@/lib/api";
import { ComponentEditForm } from "@/components/course-editor/ComponentEditForm";
import { CourseRunPreview, ComponentPreview } from "@/components/course-editor/preview";
import { NewScreenForm, NewModuleForm, ModuleHeader, ModuleScreens } from "@/components/course-editor/tree";
import type {
  EditorComponent,
  EditorCourse,
  EditorModule,
  EditorScreen,
  LiveComponent,
  QuestionStats,
  SaveHandle,
} from "@/components/course-editor/types";

// Десктопний редактор контенту курсу.
//
// Зліва — акордеон Модуль -> Екран -> Компонент (кожен рівень згортається,
// щоб було видно структуру, а не суцільний список однаково виглядних
// заголовків) + форма правки ОДНОГО обраного компонента з кнопками "Далі"/
// "Назад" — так само, як співробітник проходить курс по кроках, а не
// довгою стрічкою всіх екранів одразу. Поки кожен Screen має рівно один
// Component (1:1 зі старою моделлю Lesson) — стек кількох компонентів на
// одному екрані додається окремим кроком.
//
// Справа — жива прев'ю з тим самим "хромом", що й реальний CoursePlayer
// (шапка з лічильником кроку, прогрес-бар, кнопки навігації внизу) — не
// просто InfoScreen/QuizScreen сам по собі, а повний вигляд мобільного
// екрану співробітника, щоб було видно ТОЧНО те, що побачить він.
//
// Налаштування курсу (посади/території, дата публікації, дедлайн) звідси
// прибрані — вони на дашборді /admin (components/AdminDashboard.jsx), при
// розгортанні курсу.

const NO_MODULES: EditorModule[] = [];

export function AdminCourseEditor({ courseId }: { courseId: number | string }) {
  // Перехід з дашборду /admin по конкретному модулю (?module=ID) — одразу
  // відкриває перший екран цього модуля для правки, а не перший екран
  // першого модуля курсу.
  const searchParams = useSearchParams();
  const focusedModuleId = Number(searchParams.get("module")) || null;

  const [course, setCourse] = useState<EditorCourse | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<number | null>(null);
  const [expandedModuleId, setExpandedModuleId] = useState<number | null>(null);
  const [expandedScreenId, setExpandedScreenId] = useState<number | null>(null);
  const [livePreviewComponent, setLivePreviewComponent] = useState<LiveComponent | null>(null);
  // Повне проходження курсу в прев'ю (CourseRunPreview) — окремо від
  // модалки одного екрана.
  const [runPreview, setRunPreview] = useState(false);
  const [loadError, setLoadError] = useState("");
  // Частка правильних по кожному питанню курсу — вантажиться один раз і
  // далі лише показується біля питань (аналітика складності, 2026-09-17).
  const [questionStats, setQuestionStats] = useState<QuestionStats>({});
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/courses/${courseId}/question-stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // Статистика — довідкова: її відсутність не має ламати редактор.
        if (!cancelled && data?.stats) setQuestionStats(data.stats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [courseId]);
  const {
    containerRef: moduleListRef,
    containerProps: moduleListProps,
    registerRow: registerModuleRow,
    dragId: dragModuleId,
    dragDeltaY: dragModuleDeltaY,
  } = useIdOrder(course?.modules ?? NO_MODULES, (next) => {
    const withOrder = saveOrder("modules", next);
    updateCourse((c) => ({ ...c, modules: withOrder }));
  });

  useEffect(() => {
    let cancelled = false;
    api<EditorCourse>(`/api/admin/courses/${courseId}`)
      .then((courseData) => {
        if (cancelled) return;
        setCourse(courseData);
        const focusedModule = courseData.modules.find((m) => m.id === focusedModuleId);
        const startModule = focusedModule || courseData.modules[0];
        const startScreen = startModule?.screens[0];
        const firstComponent = startScreen?.components[0];
        if (firstComponent) {
          setSelectedComponentId(firstComponent.id);
          setExpandedModuleId(startModule.id);
          setExpandedScreenId(startScreen.id);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // Модуль -> Екран -> Компонент (див. schema.prisma): усі оновлення стану
  // йдуть через ці три обхідники, знаходячи потрібний модуль/екран за id.
  // До завантаження курсу (course === null) оновлювати нічого.
  function updateCourse(fn: (c: EditorCourse) => EditorCourse) {
    setCourse((c) => (c ? fn(c) : c));
  }
  function updateModule(moduleId: number, fn: (m: EditorModule) => EditorModule) {
    updateCourse((c) => ({ ...c, modules: c.modules.map((m) => (m.id === moduleId ? fn(m) : m)) }));
  }
  function updateScreen(screenId: number, fn: (s: EditorScreen) => EditorScreen) {
    updateCourse((c) => ({
      ...c,
      modules: c.modules.map((m) => ({ ...m, screens: m.screens.map((s) => (s.id === screenId ? fn(s) : s)) })),
    }));
  }

  function updateComponentInState(screenId: number, updated: EditorComponent) {
    updateScreen(screenId, (s) => ({ ...s, components: s.components.map((comp) => (comp.id === updated.id ? updated : comp)) }));
  }

  function removeComponentFromState(screenId: number, componentId: number) {
    updateScreen(screenId, (s) => ({ ...s, components: s.components.filter((comp) => comp.id !== componentId) }));
    if (selectedComponentId === componentId) setSelectedComponentId(null);
  }

  function addComponentToState(screenId: number, created: EditorComponent) {
    updateScreen(screenId, (s) => ({ ...s, components: [...s.components, created] }));
    setSelectedComponentId(created.id);
  }

  function reorderComponentsInState(screenId: number, reorderedComponents: EditorComponent[]) {
    updateScreen(screenId, (s) => ({ ...s, components: reorderedComponents }));
  }

  function addScreenToState(moduleId: number, created: EditorScreen) {
    updateModule(moduleId, (m) => ({ ...m, screens: [...m.screens, created] }));
  }

  function removeScreenFromState(moduleId: number, screenId: number) {
    updateModule(moduleId, (m) => ({ ...m, screens: m.screens.filter((s) => s.id !== screenId) }));
    if (selectedScreen?.id === screenId) setSelectedComponentId(null);
  }

  async function handleDeleteScreen(moduleId: number, screenId: number, screenTitle: string) {
    if (!confirm(`Видалити екран «${screenTitle}» разом з усіма його компонентами?`)) return;
    await api(`/api/admin/screens/${screenId}`, { method: "DELETE" })
      .then(() => removeScreenFromState(moduleId, screenId))
      .catch((err) => alert("Не вдалося видалити: " + err.message));
  }

  function updateModuleInState(updated: EditorModule) {
    updateModule(updated.id, (m) => ({ ...m, ...updated }));
  }

  function removeModuleFromState(moduleId: number) {
    updateCourse((c) => ({ ...c, modules: c.modules.filter((m) => m.id !== moduleId) }));
  }

  function addModuleToState(created: EditorModule) {
    updateCourse((c) => ({ ...c, modules: [...c.modules, created] }));
  }

  /**
   * Перейменування екрана. Стан оновлюємо ОДРАЗУ, не чекаючи сервера:
   * назва бере участь у навігації, хлібних крихтах і прев'ю, і бачити
   * стару ще пів секунди після Enter — гірше, ніж зрідка відкотити її
   * назад, якщо запит не пройшов.
   */
  function renameScreen(moduleId: number, screenId: number, title: string) {
    const setTitle = (value: string) => updateScreen(screenId, (s) => ({ ...s, title: value }));
    const previous = course?.modules.find((m) => m.id === moduleId)?.screens.find((s) => s.id === screenId)?.title;
    setTitle(title);
    api(`/api/admin/screens/${screenId}`, { method: "PATCH", body: { title } }).catch(() => {
      if (previous !== undefined) setTitle(previous);
    });
  }

  function persistScreenOrder(moduleId: number, nextScreens: EditorScreen[]) {
    const withOrder = saveOrder("screens", nextScreens);
    updateModule(moduleId, (m) => ({ ...m, screens: withOrder }));
  }

  // Деривативи нижче й ефект після них рахуються БЕЗУМОВНО (з безпечним
  // фолбеком на порожній курс) — early return на loadError/!course
  // винесено аж перед JSX-рендером, щоб не порушувати Rules of Hooks
  // (useEffect має викликатись в однаковому порядку на кожен рендер, а не
  // пропускатись, поки course ще не завантажився).
  const allScreens = (course?.modules ?? []).flatMap((m) => m.screens);
  const selectedComponent = allScreens.flatMap((s) => s.components).find((comp) => comp.id === selectedComponentId);
  const selectedScreen = allScreens.find((s) => s.components.some((comp) => comp.id === selectedComponentId));
  const selectedModule = (course?.modules ?? []).find((m) => m.screens.some((s) => s.id === selectedScreen?.id));

  // Плаский список УСІХ компонентів курсу в порядку проходження — для
  // "Попередній/Наступний компонент" зліва (крок редагування, не крок
  // проходження — той тепер по ЕКРАНАХ, див. previewComponents нижче) і
  // лічильника "Екран N з M" у лівій панелі.
  const flatComponents = (course?.modules ?? []).flatMap((courseModule) =>
    courseModule.screens.flatMap((screen) => screen.components.map((component) => ({ component, courseModule, screen })))
  );
  const currentIndex = flatComponents.findIndex((f) => f.component.id === selectedComponentId);

  // Компоненти поточного екрана для прев'ю — той, що зараз редагується,
  // підміняємо на його ЖИВИЙ (незбережений) стан, решта — як на сервері,
  // щоб прев'ю справді показувало ввесь екран разом, а не лише один
  // компонент, і водночас лишалось "живим" під час набору тексту.
  const previewComponents = (selectedScreen?.components ?? []).map((c) =>
    livePreviewComponent && c.id === livePreviewComponent.id ? livePreviewComponent : c
  );

  // Список ЕКРАНІВ курсу — та сама послідовність, що бачить співробітник у
  // CoursePlayer (крок = екран, а не компонент) — для "Далі"/"Назад" і
  // лічильника "N/M" САМЕ В ПРЕВ'Ю праворуч. Окремо від flatComponents/
  // currentIndex вище (той — для лівої панелі "який компонент редагувати
  // далі"): плутати їх не можна — інакше "Далі" в прев'ю перестрибувало б
  // лише на наступний КОМПОНЕНТ, а не на новий екран, як у справжньому
  // плеєрі.
  const flatScreens = (course?.modules ?? []).flatMap((courseModule) =>
    courseModule.screens.map((screen) => ({ screen, courseModule }))
  );
  const previewScreenIndex = flatScreens.findIndex((f) => f.screen.id === selectedScreen?.id);
  // Та сама наскрізна нумерація компонентів, що й у CoursePlayer.
  const componentNumbers = numberComponents(flatScreens.map((f) => f.screen));

  // Чи є що зберігати і як це зробити — приходить із самої
  // ComponentEditForm через onRegisterSave. Раніше батько виводив це
  // порівнянням livePreviewComponent із збереженим компонентом, але форма
  // знає точніше: напр. в інфо-екрана title навмисно зберігається як null,
  // і таке порівняння не сходилось би ніколи.
  const componentSaveRef = useRef<SaveHandle | null>(null);

  /**
   * Перехід між компонентами/екранами ЗБЕРІГАЄ поточний, а не питає
   * "перейти без збереження?". Раніше стояв confirm: він зупиняв роботу
   * на кожному кроці й пропонував вибір, якого насправді ніхто не хоче
   * ("так, втратьте мої правки"). Тепер зберігаємо мовчки й переходимо.
   *
   * Якщо збереження не вдалось (мережа, помилка сервера) — лишаємось на
   * місці: перейти означало б показати людині інший екран, поки її
   * правки нікуди не записались, а червоний рядок помилки лишився б
   * позаду.
   */
  async function selectComponent(moduleId: number, screenId: number, componentId: number) {
    const current = componentSaveRef.current;
    if (current?.isDirty) {
      const saved = await current.save();
      if (!saved) return;
    }
    setSelectedComponentId(componentId);
    setExpandedModuleId(moduleId);
    setExpandedScreenId(screenId);
  }

  function goToOffset(offset: number) {
    const target = flatComponents[currentIndex + offset];
    if (target) selectComponent(target.courseModule.id, target.screen.id, target.component.id);
  }

  /** "Далі"/"Назад" у прев'ю праворуч — перестрибує на ПЕРШИЙ компонент
   * наступного/попереднього ЕКРАНА (не наступний компонент того ж екрана),
   * бо саме так рухається справжній плеєр: один крок = один екран, хоч би
   * скільки компонентів на ньому стояло. */
  function goToScreenOffset(offset: number) {
    const target = flatScreens[previewScreenIndex + offset];
    const firstComponent = target?.screen.components[0];
    if (firstComponent) selectComponent(target.courseModule.id, target.screen.id, firstComponent.id);
  }

  // Браузерного "Покинути сайт?" тут навмисно НЕМАЄ (рішення користувача):
  // воно спрацьовувало на будь-який дотик до форми й блокувало навіть
  // звичайний перехід за посиланням усередині адмінки.
  //
  // Замість діалогу правки зберігаються при переході між
  // компонентами/екранами, по кнопці «Зберегти» і ще раз — при самому
  // закритті вкладки (ComponentEditForm, слухач pagehide з keepalive).

  async function handleDuplicateComponent(component: EditorComponent) {
    const screen = allScreens.find((s) => s.components.some((comp) => comp.id === component.id));
    if (!screen) return;
    const body = {
      screenId: screen.id,
      title: component.title ? `${component.title} (копія)` : null,
      type: component.type,
      order: screen.components.length + 1,
      content: component.content,
    };
    await api<EditorComponent>("/api/admin/components", { method: "POST", body })
      .then((created) => addComponentToState(screen.id, created))
      .catch((err) => alert("Не вдалося дублювати: " + err.message));
  }

  if (loadError) return <p className="admin-page admin-error">Не вдалося завантажити курс: {loadError}</p>;
  if (!course)
    return (
      <LoadingLine className="admin-page" />
    );

  return (
    <div className="admin-editor">
      <div className="admin-editor-header">
        <div>
          <Link href="/admin" className="admin-btn-link">
            ← Курси
          </Link>
          <h1>{course.title}</h1>
        </div>
      </div>

      {/* is-laptop-preview — коли курс узгоджено на "Ноутбук", докнута
          колонка справа не показує сам мокап (він однаково відкривається
          лише в модалці, .admin-laptop-preview-placeholder) — тож їй не
          треба 30% ширини заради самої кнопки "Відкрити прев'ю", і
          редактор отримує решту простору назад. */}
      <div className={`admin-editor-grid${course.previewDevice === "laptop" ? " is-laptop-preview" : ""}`}>
        <div className="admin-editor-edit" ref={moduleListRef} {...moduleListProps}>
          {course.modules.map((courseModule) => {
            const isModuleExpanded = expandedModuleId === courseModule.id;
            const moduleComponentCount = courseModule.screens.reduce((n, s) => n + s.components.length, 0);
            return (
              <section
                key={courseModule.id}
                ref={registerModuleRow(courseModule.id)}
                data-drag-row
                className={`admin-block admin-drag-row is-handle-only${dragModuleId === courseModule.id ? " is-dragging" : ""}`}
                style={dragModuleId === courseModule.id ? { transform: `translateY(${dragModuleDeltaY}px)` } : undefined}
              >
                <ModuleHeader
                  courseModule={courseModule}
                  expanded={isModuleExpanded}
                  onToggleExpand={() => setExpandedModuleId(isModuleExpanded ? null : courseModule.id)}
                  summary={`${pluralize(courseModule.screens.length, "екран", "екрани", "екранів")} · ${pluralize(moduleComponentCount, "компонент", "компоненти", "компонентів")}`}
                  onSaved={updateModuleInState}
                  onDeleted={removeModuleFromState}
                />

                {isModuleExpanded && (
                  <div className="admin-accordion-body">
                    <ModuleScreens
                      courseModule={courseModule}
                      expandedScreenId={expandedScreenId}
                      onToggleScreen={(screenId) => setExpandedScreenId(expandedScreenId === screenId ? null : screenId)}
                      onDeleteScreen={(screen) => handleDeleteScreen(courseModule.id, screen.id, screen.title)}
                      onRenameScreen={(screen, title) => renameScreen(courseModule.id, screen.id, title)}
                      onReorder={(next) => persistScreenOrder(courseModule.id, next)}
                      questionStats={questionStats}
                      selectedComponentId={selectedComponentId}
                      onSelectComponent={(screenId, componentId) => selectComponent(courseModule.id, screenId, componentId)}
                      onComponentsReordered={reorderComponentsInState}
                      onComponentCreated={addComponentToState}
                    />

                    <NewScreenForm
                      moduleId={courseModule.id}
                      nextOrder={courseModule.screens.length + 1}
                      onCreated={(created) => {
                        addScreenToState(courseModule.id, created);
                        setExpandedScreenId(created.id);
                      }}
                    />
                  </div>
                )}
              </section>
            );
          })}

          <NewModuleForm
            courseId={course.id}
            nextOrder={course.modules.length + 1}
            onCreated={(created) => {
              addModuleToState(created);
              setExpandedModuleId(created.id);
            }}
          />

          {selectedComponent && selectedScreen && selectedModule && (
            <div className="admin-lesson-editor-panel">
              <div className="admin-breadcrumb">
                <span>{selectedModule.title}</span>
                <span className="admin-breadcrumb-sep">›</span>
                <span>{selectedScreen.title}</span>
                <span className="admin-breadcrumb-sep">·</span>
                <span>
                  Екран {currentIndex + 1} з {flatComponents.length}
                </span>
              </div>
              <ComponentEditForm
                key={selectedComponent.id}
                component={selectedComponent}
                onSaved={(updated) => updateComponentInState(selectedScreen.id, updated)}
                onDeleted={(id) => removeComponentFromState(selectedScreen.id, id)}
                onDuplicate={handleDuplicateComponent}
                onLiveChange={setLivePreviewComponent}
                onRegisterSave={(api) => {
                  componentSaveRef.current = api;
                }}
              />
              <div className="admin-row admin-lesson-step-nav">
                <button
                  type="button"
                  className="admin-btn-link"
                  onClick={() => goToOffset(-1)}
                  disabled={currentIndex <= 0}
                  title="Перейти до редагування попереднього екрану курсу"
                >
                  ← Попередній екран
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => goToOffset(1)}
                  disabled={currentIndex < 0 || currentIndex >= flatComponents.length - 1}
                  title="Перейти до редагування наступного екрану курсу"
                >
                  Наступний екран →
                </button>
              </div>
            </div>
          )}
        </div>

        <ComponentPreview
          components={previewComponents}
          componentNumbers={componentNumbers}
          stepNumber={previewScreenIndex + 1}
          totalSteps={flatScreens.length}
          onBack={() => goToScreenOffset(-1)}
          onNext={() => goToScreenOffset(1)}
          canGoBack={previewScreenIndex > 0}
          canGoNext={previewScreenIndex >= 0 && previewScreenIndex < flatScreens.length - 1}
          previewDevice={course.previewDevice || "phone"}
          onRunCourse={() => setRunPreview(true)}
        />
        {runPreview && <CourseRunPreview course={course} onClose={() => setRunPreview(false)} />}
      </div>
    </div>
  );
}
