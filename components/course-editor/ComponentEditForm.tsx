"use client";

import { useEffect, useRef, useState } from "react";
import { SpinnerIcon } from "@/components/icons";
import { COMPONENT_TYPES, COMPONENT_TYPE_LABELS, RETIRED_COMPONENT_TYPES, defaultContentForType } from "@/lib/componentTypes";
import { api } from "@/lib/api";
import { ComponentTypeFields } from "@/components/course-editor/ComponentTypeFields";
import type { EditorComponent, LiveComponent, SaveHandle } from "@/components/course-editor/types";

/** Тільки поля форми правки (без грід-обгортки) — рендериться в лівій
 * колонці спільного admin-editor-grid разом з навігацією по екранах. */
export function ComponentEditForm({
  component,
  onSaved,
  onDeleted,
  onDuplicate,
  onLiveChange,
  onRegisterSave,
}: {
  component: EditorComponent;
  onSaved: (saved: EditorComponent) => void;
  onDeleted: (id: number) => void;
  onDuplicate: (component: EditorComponent) => void;
  onLiveChange: (live: LiveComponent) => void;
  onRegisterSave?: (handle: SaveHandle | null) => void;
}) {
  const [title, setTitle] = useState(component.title || "");
  const [type, setType] = useState(component.type);
  const [content, setContent] = useState(component.content);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  // Батько рендерить <ComponentEditForm key={component.id} .../> — зміна
  // component.id вже сама по собі перемонтовує форму (useState підхопить
  // нові initial values). Цей ефект — для іншого випадку: той самий
  // component.id, але вміст оновився ЗЗОВНІ (сервер повернув нормалізовані
  // дані після handleSave) — синхронізуємо форму з тим, що реально
  // зберіглося.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(component.title || "");
    setType(component.type);
    setContent(component.content);
    setError("");
    setImageUploading(false);
  }, [component.id, component.title, component.type, component.content]);

  // Прокидаємо поточний стан форми нагору для живої прев'ю в правій колонці.
  useEffect(() => {
    onLiveChange({ id: component.id, title, type, content });
  }, [component.id, title, type, content, onLiveChange]);

  // Незбережені правки — порівнюємо з тим, що реально лежить на сервері
  // (component-пропс), а не з "чи змінили хоч раз" — так індикатор гасне
  // сам собою, якщо повернути значення до вихідного вручну.
  // Те саме значення, що реально піде в PATCH — інакше в інфо-екрана з
  // раніше збереженою назвою індикатор "незбережені зміни" світився б
  // вічно: поле сховане, змінити його нічим, а порівняння не сходиться.
  const effectiveTitle = type === "info" ? null : title || null;
  const isDirty =
    effectiveTitle !== (component.title || null) ||
    type !== component.type ||
    JSON.stringify(content) !== JSON.stringify(component.content);

  // Застарілий тип лишається в списку ЛИШЕ поки він у цього
  // компонента: обрати його заново, перемкнувшись на інший тип і назад,
  // уже не можна.
  const selectableTypes = COMPONENT_TYPES.some((t) => t.value === type)
    ? COMPONENT_TYPES
    : [...COMPONENT_TYPES, ...RETIRED_COMPONENT_TYPES.filter((t) => t.value === type)];

  // Збереження відбувається ЛИШЕ при переході на інший компонент/екран
  // (і по кнопці «Зберегти»). Автозбереження по таймеру тут свідомо
  // немає: воно слало б PATCH кожні кілька секунд набору тексту — сотні
  // зайвих записів у базу за одну сесію редагування замість одного.
  //
  // saveRef тримає АКТУАЛЬНУ версію handleSave (вона замикає title/type/
  // content поточного рендера) — інакше батько викликав би збереження зі
  // станом, яким він був на момент першого рендера. Оновлюємо в ефекті, а
  // не в тілі компонента (запис у ref під час рендера — помилка
  // react-hooks/refs); ефект без списку залежностей виконується після
  // КОЖНОГО рендера, тож у ref завжди свіжа функція.
  const saveRef = useRef(handleSave);
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    saveRef.current = handleSave;
    isDirtyRef.current = isDirty;
  });

  // Остання страховка: закриття вкладки чи перехід за посиланням. Рівно
  // ОДИН запит і лише якщо є що зберігати — це не автозбереження по
  // таймеру, від якого ми свідомо відмовились. pagehide, а не
  // beforeunload: той показує браузерний діалог "Покинути сайт?", якого
  // тут бути не повинно.
  useEffect(() => {
    function flushOnLeave() {
      if (!isDirtyRef.current) return;
      saveRef.current({ silent: true, keepalive: true });
    }
    window.addEventListener("pagehide", flushOnLeave);
    return () => window.removeEventListener("pagehide", flushOnLeave);
  }, []);

  // Батько зберігає цей компонент перед переходом на інший — тому йому
  // потрібен доступ і до самої функції, і до того, чи є що зберігати.
  // Після видалення форма зникає — реєстрацію знімаємо, інакше наступний
  // перехід намагався б зберегти вже видалений компонент і не пускав далі.
  useEffect(() => {
    onRegisterSave?.({ save: () => saveRef.current({ silent: true }), isDirty });
    return () => onRegisterSave?.(null);
  }, [onRegisterSave, isDirty]);

  function handleTypeChange(newType: string) {
    setType(newType);
    setContent(defaultContentForType(newType));
  }

  /**
   * silent — виклик не від кнопки, а
   *   від автозбереження чи переходу на інший компонент. Тоді причини, з
   *   яких зберігати ще рано (вантажиться фото, у питання немає тексту),
   *   не показуються помилкою: користувач нічого не натискав, і червоний
   *   рядок нізвідки лише збивав би з пантелику. Просто пропускаємо —
   *   наступна спроба станеться сама.
   */
  async function handleSave(opts: { silent?: boolean; keepalive?: boolean } = {}) {
    const silent = opts.silent === true;
    // keepalive — щоб запит пережив закриття вкладки: звичайний fetch у
    // цей момент браузер просто скасовує.
    const keepalive = opts.keepalive === true;
    // Фото ще вантажиться (в тому ж content.images) — url на цю мить
    // порожній, зберегти зараз означало б записати екран без фото.
    if (imageUploading) {
      if (!silent) setError("Зачекайте, поки фото завантажиться, і збережіть ще раз.");
      return false;
    }
    if (type === "quiz" && !title.trim()) {
      if (!silent) setError("Для питання заголовок (текст питання) обов'язковий.");
      return false;
    }
    setError("");
    setSaving(true);
    try {
      // Для інфо-екрана поле сховане, тож і зберігаємо null, а не старе
      // значення: інакше в навігації зліва лишався б підпис, який уже нічим
      // не відредагувати й не прибрати.
      const body = { title: type === "info" ? null : title || null, type, content };
      onSaved(await api<EditorComponent>(`/api/admin/components/${component.id}`, { method: "PATCH", body, keepalive }));
      return true;
    } catch (err) {
      // Помилку показуємо ЗАВЖДИ, навіть при тихому збереженні: мовчки
      // проковтнути невдалий запис означало б, що людина далі редагує
      // курс у впевненості, що все збережено.
      setError("Помилка збереження: " + (err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Видалити екран «${component.title || COMPONENT_TYPE_LABELS[component.type]}»?`)) return;
    await api(`/api/admin/components/${component.id}`, { method: "DELETE" })
      .then(() => onDeleted(component.id))
      .catch((err) => alert("Не вдалося видалити: " + err.message));
  }

  return (
    <div className="admin-lesson-card">
      <div className="admin-row">
        {/* Інфо-екран не має службової назви: у нього вже є рубрика й
            заголовок, які видно самому співробітнику, і третій підпис
            "лише для адмінки" дублював їх, нічого не додаючи. В інших
            типах поле лишається: у quiz це ТЕКСТ ПИТАННЯ (обов'язковий,
            а не службовий підпис), у решти — єдиний спосіб розрізнити
            однотипні екрани в навігації зліва. */}
        {type !== "info" && (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === "quiz" ? "Текст питання" : "Назва (лише для адмінки)"}
            className="admin-input-flex admin-title-input"
          />
        )}
        {/* Якщо в цього компонента застарілий тип (є в збереженому
            контенті, але вже не пропонується) — додаємо його в список
            окремим варіантом. Інакше select не знайшов би свого значення,
            показав би чужий тип і перезаписав би його при збереженні. */}
        <select
          value={type}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="admin-select"
          title={selectableTypes.find((t) => t.value === type)?.hint}
        >
          {selectableTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {isDirty && (
          <span className="admin-hint admin-unsaved-badge" title="Є незбережені зміни на цьому екрані">
            ● незбережено
          </span>
        )}
      </div>
      <p className="admin-hint">{COMPONENT_TYPES.find((t) => t.value === type)?.hint}</p>

      <ComponentTypeFields
        type={type}
        content={content}
        onChange={setContent}
        componentId={component.id}
        onUploadingChange={setImageUploading}
      />

      {error && <p className="admin-error">{error}</p>}
      <div className="admin-row">
        <button
          type="button"
          onClick={() => handleSave()}
          disabled={saving || imageUploading}
          className="admin-btn"
          title="Зберегти зміни цього екрану"
        >
          {(saving || imageUploading) && <SpinnerIcon />}
          {imageUploading ? "Зачекайте, фото вантажиться…" : saving ? "Збереження…" : "Зберегти"}
        </button>
        <button type="button" onClick={() => onDuplicate(component)} className="admin-btn-link" title="Створити копію цього екрану одразу після нього">
          Дублювати
        </button>
        <button type="button" onClick={handleDelete} className="admin-btn admin-btn-danger" title="Видалити цей екран назавжди">
          Видалити
        </button>
      </div>
    </div>
  );
}
