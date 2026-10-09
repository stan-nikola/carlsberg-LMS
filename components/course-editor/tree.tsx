"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronIcon, GripIcon, PencilIcon } from "@/components/icons";
import { COMPONENT_TYPES, COMPONENT_TYPE_LABELS, defaultContentForType } from "@/lib/componentTypes";
import { HintDot } from "@/components/HintDot";
import { useDragReorder } from "@/lib/useDragReorder";
import { saveOrder, useIdOrder } from "@/lib/useIdOrder";
import { api } from "@/lib/api";
import { NewItemForm } from "@/components/course-editor/NewItemForm";
import type { EditorComponent, EditorModule, EditorScreen, QuestionStats } from "@/components/course-editor/types";

/** Список компонентів екрана: тягнеться за ручку (useIdOrder), порядок
 *  зберігається одразу. */
function ComponentNavList({
  components,
  selectedComponentId,
  onSelect,
  onReordered,
  questionStats = {},
}: {
  components: EditorComponent[];
  selectedComponentId: number | null;
  onSelect: (componentId: number) => void;
  onReordered: (reordered: EditorComponent[]) => void;
  questionStats?: QuestionStats;
}) {
  const { containerRef, containerProps, registerRow, dragId, dragDeltaY } = useIdOrder(components, (next) =>
    onReordered(saveOrder("components", next))
  );

  return (
    <div className="admin-lesson-nav" ref={containerRef} {...containerProps}>
      {components.map((component) => (
        <div
          key={component.id}
          ref={registerRow(component.id)}
          data-drag-row
          className={`admin-lesson-nav-row admin-drag-row is-handle-only${dragId === component.id ? " is-dragging" : ""}`}
          style={dragId === component.id ? { transform: `translateY(${dragDeltaY}px)` } : undefined}
        >
          <span className="admin-drag-handle" data-drag-handle title="Перетягніть, щоб змінити порядок екранів">
            <GripIcon />
          </span>
          <button
            type="button"
            className={`admin-lesson-nav-item${component.id === selectedComponentId ? " active" : ""}`}
            onClick={() => onSelect(component.id)}
            title="Відкрити цей екран для редагування"
          >
            <span>{component.title || COMPONENT_TYPE_LABELS[component.type]}</span>
            <span className="admin-lesson-nav-type">
              {COMPONENT_TYPE_LABELS[component.type] || component.type}
              {/* Частка правильних по цьому питанню — «легке/складне»
                  видно одразу в списку, без переходу в саме питання. */}
              {questionStats[component.id] ? (
                <b className={questionStats[component.id].pct < 50 ? "admin-q-stat is-hard" : "admin-q-stat"}>
                  {questionStats[component.id].pct}%
                </b>
              ) : null}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

type NewItemProps<T> = { nextOrder: number; onCreated: (created: T) => void };

function NewComponentForm({ screenId, nextOrder, onCreated }: NewItemProps<EditorComponent> & { screenId: number }) {
  const [type, setType] = useState("info");
  return (
    <NewItemForm
      endpoint="/api/admin/components"
      makeBody={(title) => ({ screenId, title: title || null, type, order: nextOrder, content: defaultContentForType(type) })}
      titleRequired={false}
      onCreated={onCreated}
      placeholder="Назва нового екрану (необов'язково)"
      label="+ Додати компонент"
      hint="Створити новий компонент на цьому екрані"
    >
      <select value={type} onChange={(e) => setType(e.target.value)} className="admin-select">
        {COMPONENT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </NewItemForm>
  );
}

export function NewScreenForm({ moduleId, nextOrder, onCreated }: NewItemProps<EditorScreen> & { moduleId: number }) {
  return (
    <NewItemForm
      endpoint="/api/admin/screens"
      makeBody={(title) => ({ moduleId, title, order: nextOrder })}
      onCreated={onCreated}
      placeholder="Назва нового екрану"
      label="+ Додати екран"
      hint="Створити новий екран у цьому модулі"
      buttonClassName="admin-btn-link"
    />
  );
}

export function NewModuleForm({ courseId, nextOrder, onCreated }: NewItemProps<EditorModule> & { courseId: number }) {
  return (
    <NewItemForm
      endpoint="/api/admin/modules"
      makeBody={(title) => ({ courseId, title, order: nextOrder })}
      onCreated={onCreated}
      placeholder="Назва нового модуля"
      label="+ Додати модуль"
      hint="Створити новий модуль курсу"
      inputClassName="admin-input-flex admin-title-input"
    />
  );
}

export function ModuleHeader({
  courseModule,
  expanded,
  onToggleExpand,
  summary,
  onSaved,
  onDeleted,
}: {
  courseModule: EditorModule;
  expanded: boolean;
  onToggleExpand: () => void;
  summary: string;
  onSaved: (updated: EditorModule) => void;
  onDeleted: (moduleId: number) => void;
}) {
  const [title, setTitle] = useState(courseModule.title);
  const [cooldownDays, setCooldownDays] = useState(courseModule.cooldownDays ?? "");
  const [retakeCooldownDays, setRetakeCooldownDays] = useState(courseModule.retakeCooldownDays ?? "");
  const [questionPoolSize, setQuestionPoolSize] = useState(courseModule.questionPoolSize ?? "");
  const [retryFreeAttempts, setRetryFreeAttempts] = useState(courseModule.retryFreeAttempts ?? "");
  const [retryCooldownHours, setRetryCooldownHours] = useState(courseModule.retryCooldownHours ?? "");
  const [saving, setSaving] = useState(false);

  async function save(patch: Partial<EditorModule>) {
    setSaving(true);
    try {
      onSaved(await api<EditorModule>(`/api/admin/modules/${courseModule.id}`, { method: "PATCH", body: patch }));
    } catch (err) {
      alert("Не вдалося зберегти модуль: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleTitleBlur() {
    if (title === courseModule.title || !title.trim()) return;
    save({ title });
  }

  function handleCooldownBlur() {
    const value = cooldownDays === "" ? null : Number(cooldownDays);
    if (value === (courseModule.cooldownDays ?? null)) return;
    save({ cooldownDays: value });
  }

  function handleRetakeCooldownBlur() {
    const value = retakeCooldownDays === "" ? null : Number(retakeCooldownDays);
    if (value === (courseModule.retakeCooldownDays ?? null)) return;
    save({ retakeCooldownDays: value });
  }

  /** Числові поля модуля зберігаються однаково: порожньо = null (успадкувати
   *  або «без обмежень»), інакше число; без змін — запиту немає. */
  function numericBlur(field: "questionPoolSize" | "retryFreeAttempts" | "retryCooldownHours", raw: number | string) {
    return () => {
      const value = raw === "" ? null : Number(raw);
      if (value === (courseModule[field] ?? null)) return;
      save({ [field]: value });
    };
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Видалити модуль «${courseModule.title}» разом з усіма його екранами?`)) return;
    await api(`/api/admin/modules/${courseModule.id}`, { method: "DELETE" })
      .then(() => onDeleted(courseModule.id))
      .catch((err) => alert("Не вдалося видалити: " + err.message));
  }

  return (
    <div className="admin-accordion-header" onClick={onToggleExpand}>
      <span
        className="admin-drag-handle"
        data-drag-handle
        title="Перетягніть, щоб змінити порядок модулів"
        onClick={(e) => e.stopPropagation()}
      >
        <GripIcon />
      </span>
      <span className={`admin-accordion-caret${expanded ? " open" : ""}`}>
        <ChevronIcon />
      </span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleTitleBlur}
        onClick={(e) => e.stopPropagation()}
        className="admin-input-flex admin-title-input"
        style={{ fontSize: 16, fontWeight: 700 }}
      />
      {!expanded && <span className="admin-hint admin-accordion-summary">{summary}</span>}
      {expanded && (
        <label
          className="admin-module-unlock"
          onClick={(e) => e.stopPropagation()}
          title="Скільки днів має минути з моменту, як співробітник склав ПОПЕРЕДНІЙ модуль, перш ніж відкриється цей"
        >
          Пауза між модулями
          <input
            type="number"
            min="0"
            value={cooldownDays}
            onChange={(e) => setCooldownDays(e.target.value)}
            onBlur={handleCooldownBlur}
            placeholder="0"
          />
          дн.
        </label>
      )}
      {expanded && (
        <label
          className="admin-module-unlock"
          onClick={(e) => e.stopPropagation()}
          title="Скільки днів має минути з моменту, як співробітник СКЛАВ цей модуль, перш ніж зможе перепройти його ще раз (реальний тест). На провалену спробу не впливає — її можна перепройти одразу."
        >
          Пауза перед повторним проходженням
          <input
            type="number"
            min="0"
            value={retakeCooldownDays}
            onChange={(e) => setRetakeCooldownDays(e.target.value)}
            onBlur={handleRetakeCooldownBlur}
            placeholder="2"
          />
          дн.
        </label>
      )}
      {/* Пул питань і перевизначення правил перескладання — тут, поруч із
          паузами, а не в налаштуваннях курсу: це властивості КОНКРЕТНОГО
          модуля, і автор задає їх, коли вже бачить, скільки в модулі
          питань і наскільки він складний. Пояснення — на «ⓘ», бо в один
          рядок ці правила не вміщаються. */}
      {expanded && (
        <label className="admin-module-unlock" onClick={(e) => e.stopPropagation()}>
          Питань за спробу
          <input
            type="number"
            min="0"
            value={questionPoolSize}
            onChange={(e) => setQuestionPoolSize(e.target.value)}
            onBlur={numericBlur("questionPoolSize", questionPoolSize)}
            placeholder="усі"
            className="admin-num-wide"
          />
          <HintDot
            align="end"
            text="Скільки питань модуля показувати за одну спробу — випадкові з усіх, що є. Саме це ламає перебір варіантів при перескладанні: з другого разу питання інші, а знання те саме. Порожньо або число, не менше за кількість питань — показуються всі. Вибірка робиться на сервері, тож підглянути решту в коді сторінки не вийде."
          />
        </label>
      )}
      {expanded && (
        <label className="admin-module-unlock" onClick={(e) => e.stopPropagation()}>
          Спроб без паузи
          <input
            type="number"
            min="0"
            value={retryFreeAttempts}
            onChange={(e) => setRetryFreeAttempts(e.target.value)}
            onBlur={numericBlur("retryFreeAttempts", retryFreeAttempts)}
            placeholder="з курсу"
            className="admin-num-wide"
          />
          <HintDot
            align="end"
            text="Перевизначає правило курсу для ЦЬОГО модуля: скільки разів підряд можна перескласти його без паузи, якщо не склали. Порожньо — береться значення з налаштувань курсу («Перескладання»). Нуль — пауза діє одразу після першої невдалої спроби."
          />
        </label>
      )}
      {expanded && (
        <label className="admin-module-unlock" onClick={(e) => e.stopPropagation()}>
          Пауза, годин
          <input
            type="number"
            min="0"
            value={retryCooldownHours}
            onChange={(e) => setRetryCooldownHours(e.target.value)}
            onBlur={numericBlur("retryCooldownHours", retryCooldownHours)}
            placeholder="з курсу"
            className="admin-num-wide"
          />
          <HintDot
            align="end"
            text="Скільки годин чекати після вичерпання вільних спроб саме в цьому модулі. Порожньо — береться значення з налаштувань курсу. Нуль — паузи немає, скільки б спроб не було."
          />
        </label>
      )}
      {saving && <span className="admin-hint">збереження…</span>}
      <button type="button" onClick={handleDelete} className="admin-icon-btn" aria-label="Видалити модуль" title="Видалити цей модуль і весь його вміст">
        ✕
      </button>
    </div>
  );
}

function ScreenHeader({
  screen,
  expanded,
  onToggleExpand,
  summary,
  onDelete,
  index,
  total,
  onMove,
  onRename,
}: {
  screen: EditorScreen;
  expanded: boolean;
  onToggleExpand: () => void;
  summary: string;
  onDelete: () => void;
  index: number;
  total: number;
  onMove?: (dir: -1 | 1) => void;
  onRename?: (title: string) => void;
}) {
  // Перейменування — прямо в рядку, як у модуля (ModuleHeader): окрема
  // форма чи діалог заради одного поля були б важчі за саму дію.
  // Олівець, а не «клік по назві»: сам рядок уже клікабельний і розгортає
  // екран, тож без явної кнопки перейменування конфліктувало б із ним.
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(screen.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Синхронізувати title з пропсом ефектом НЕ можна (правило React
  // Compiler: setState усередині ефекту тягне каскад рендерів) — та й не
  // треба: поле наповнюється в мить входу в режим, а поза ним його
  // значення нікому не потрібне.
  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  function startRenaming() {
    setTitle(screen.title);
    setRenaming(true);
  }

  function commit() {
    setRenaming(false);
    const next = title.trim();
    // Порожня назва — не зберігаємо: екран лишився б безіменним рядком у
    // навігації, знайти його потім було б нічим.
    if (!next || next === screen.title) {
      setTitle(screen.title);
      return;
    }
    onRename?.(next);
  }

  // Рядок і розгортається по кліку, і тягнеться (lib/useDragReorder.ts).
  // Хук рух відстежує, але клік НЕ гасить — його теперішнім користувачам
  // (кроки «порядку») це не було потрібно, там onClick немає взагалі. Тут
  // потрібно: без цієї перевірки екран після кожного перетягування ще й
  // розгортався б. 4px — той самий поріг, що й у хука (CLICK_SLOP_PX).
  const pressYRef = useRef<number | null>(null);

  return (
    <div
      className="admin-accordion-header admin-accordion-header-sub"
      onPointerDown={(e) => {
        pressYRef.current = e.clientY;
      }}
      onClick={(e) => {
        const pressedAt = pressYRef.current;
        pressYRef.current = null;
        if (pressedAt !== null && Math.abs(e.clientY - pressedAt) > 4) return;
        onToggleExpand();
      }}
    >
      {/* Тягнути екран можна ЛИШЕ за цю ручку або стрілками (рішення
          користувача 2026-09-23, після спроби зробити всю картку
          хапалкою): решта рядка — звичайні клікабельні елементи, і
          передусім шеврон, який розгортає екран. Коли драг стартував із
          будь-якої точки, шеврон переставав спрацьовувати — картка просто
          сіпалась під пальцем. */}
      <button
        type="button"
        className="admin-drag-handle"
        data-drag-handle
        title="Перетягніть, щоб змінити порядок екранів"
        aria-label={`Перетягніть екран «${screen.title}» — або керуйте стрілками нижче`}
        onClick={(e) => e.stopPropagation()}
      >
        <GripIcon />
      </button>
      <span className={`admin-accordion-caret${expanded ? " open" : ""}`}>
        <ChevronIcon />
      </span>
      {renaming ? (
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setTitle(screen.title);
              setRenaming(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="admin-input-flex admin-title-input"
          aria-label="Назва екрана"
        />
      ) : (
        <h3>{screen.title}</h3>
      )}
      {!renaming && (
        <button
          type="button"
          className="admin-icon-btn admin-icon-btn--edit"
          onClick={(e) => {
            e.stopPropagation();
            startRenaming();
          }}
          aria-label="Перейменувати екран"
          title="Перейменувати екран"
        >
          <PencilIcon />
        </button>
      )}
      <span className="admin-hint admin-accordion-summary">{summary}</span>
      {/* Стрілки — не дубль перетягування, а єдиний спосіб змінити порядок
          там, де HTML5-drag не працює взагалі: планшет, телефон, клавіатура.
          Ті самі стрілки, що в «порядку кроків» у плеєра. */}
      {onMove && (
        <span className="admin-accordion-moves">
          <button
            type="button"
            className="admin-icon-btn admin-icon-btn--move"
            onClick={(e) => {
              e.stopPropagation();
              onMove(-1);
            }}
            disabled={index === 0}
            aria-label="Підняти екран"
            title="Підняти екран вище"
          >
            {/* SVG, а не гліф «↑»: текстова стрілка сидить у рядку вище
                оптичного центру, і в кружку кнопки виглядала зсунутою —
                паддингом це не лікується, бо залежить від метрики шрифту. */}
            <span className="admin-move-ico is-up" aria-hidden="true">
              <ChevronIcon />
            </span>
          </button>
          <button
            type="button"
            className="admin-icon-btn admin-icon-btn--move"
            onClick={(e) => {
              e.stopPropagation();
              onMove(1);
            }}
            disabled={index === total - 1}
            aria-label="Опустити екран"
            title="Опустити екран нижче"
          >
            <span className="admin-move-ico is-down" aria-hidden="true">
              <ChevronIcon />
            </span>
          </button>
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="admin-icon-btn"
        aria-label="Видалити екран"
        title="Видалити цей екран і всі його компоненти"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Список екранів модуля з перетягуванням. Окремий компонент, а не шматок
 * JSX усередині map — інакше useDragReorder довелось би викликати в циклі,
 * що заборонено правилами хуків: кожен модуль має власний список і власний
 * стан перетягування.
 *
 * Механіка — той самий lib/useDragReorder.ts, що вже тягає кроки «порядку»
 * в конструкторі й у плеєрі: pointer events (працює і пальцем, на відміну
 * від HTML5-drag), FLIP-доїзд сусідів, стрілки з клавіатури на ручці.
 * Другого механізму перетягування в цьому файлі свідомо не заводимо.
 */
export function ModuleScreens({
  courseModule,
  expandedScreenId,
  onToggleScreen,
  onDeleteScreen,
  onRenameScreen,
  onReorder,
  questionStats,
  selectedComponentId,
  onSelectComponent,
  onComponentsReordered,
  onComponentCreated,
}: {
  courseModule: EditorModule;
  expandedScreenId: number | null;
  onToggleScreen: (screenId: number) => void;
  onDeleteScreen: (screen: EditorScreen) => void;
  onRenameScreen: (screen: EditorScreen, title: string) => void;
  onReorder: (next: EditorScreen[]) => void;
  questionStats: QuestionStats;
  selectedComponentId: number | null;
  onSelectComponent: (screenId: number, componentId: number) => void;
  onComponentsReordered: (screenId: number, reordered: EditorComponent[]) => void;
  onComponentCreated: (screenId: number, created: EditorComponent) => void;
}) {
  const screens = courseModule.screens;
  const { containerRef, containerProps, registerRow, dragId, dragDeltaY, moveByKeyboard } = useIdOrder(screens, onReorder);

  return (
    // Клас на обгортці обов'язковий: щільний список екранів із
    // роздільниками тримається саме на ньому. Доти правило було
    // прив'язане до .admin-accordion-body, і поява цієї обгортки розірвала
    // селектор — між екранами знову з'явилось по 32px порожнечі
    // (скарга користувача 2026-09-23).
    <div ref={containerRef} {...containerProps} className="admin-screen-list">
      {screens.map((screen, screenIndex) => {
        const isScreenExpanded = expandedScreenId === screen.id;
        return (
          <section
            key={screen.id}
            ref={registerRow(screen.id)}
            data-drag-row
            className={`admin-module admin-drag-row is-handle-only${dragId === screen.id ? " is-dragging" : ""}`}
            style={dragId === screen.id ? { transform: `translateY(${dragDeltaY}px)` } : undefined}
          >
            <ScreenHeader
              screen={screen}
              expanded={isScreenExpanded}
              onToggleExpand={() => onToggleScreen(screen.id)}
              summary={`${screen.components.length} комп.`}
              onDelete={() => onDeleteScreen(screen)}
              onRename={(title) => onRenameScreen(screen, title)}
              index={screenIndex}
              total={screens.length}
              onMove={(dir) => moveByKeyboard(screen.id, dir)}
            />

            {isScreenExpanded && (
              <div className="admin-accordion-body">
                <ComponentNavList
                  questionStats={questionStats}
                  components={screen.components}
                  selectedComponentId={selectedComponentId}
                  onSelect={(componentId) => onSelectComponent(screen.id, componentId)}
                  onReordered={(reordered) => onComponentsReordered(screen.id, reordered)}
                />
                <NewComponentForm
                  screenId={screen.id}
                  nextOrder={screen.components.length + 1}
                  onCreated={(created) => onComponentCreated(screen.id, created)}
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
