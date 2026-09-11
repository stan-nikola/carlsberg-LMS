"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GripIcon, ChevronIcon, SpinnerIcon, InfoIcon } from "@/components/icons";
import { TerritoryPicker } from "@/components/TerritoryPicker";
import { COURSE_CATEGORIES } from "@/lib/courseCategories";
import { STREAK_PRESET_MESSAGES } from "@/lib/streakMessages";

// Дашборд /admin: курси розгортаються списком своїх модулів (клік по
// заголовку курсу), клік по модулю веде в редактор курсу (components/
// AdminCourseEditor.jsx) одразу до цього модуля (?module=ID). Тут же — форми
// створення нового курсу (назва + всі атрибути, як у CourseSettingsBar
// редактора) і нового модуля всередині вже наявного курсу.

function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Спільний заголовок-акордеон для обох полів "Кому призначати" (посади /
 * співробітники) — та сама caret+summary поведінка, щоб обидва блоки
 * виглядали однаково: згорнуто за замовчуванням (другорядні, необов'язкові
 * поля), згорнутий заголовок все одно показує, що вже обрано. */
function AccordionField({ title, summary, children, footer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`admin-field admin-target-card${open ? " admin-target-card-open" : ""}`}>
      <div className="admin-accordion-header admin-territory-accordion-header" onClick={() => setOpen((v) => !v)}>
        <span className={`territory-caret${open ? " territory-caret-open" : ""}`}>
          <ChevronIcon />
        </span>
        <span className="admin-label" style={{ marginBottom: 0 }}>
          {title}
        </span>
        {!open && summary && <span className="admin-hint admin-accordion-summary">{summary}</span>}
      </div>
      {open && (
        <div className="admin-accordion-body" style={{ paddingLeft: 0, paddingTop: 10 }}>
          {children}
          {footer && (
            <p className="admin-hint" style={{ marginTop: 6 }}>
              {footer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Іконка "ⓘ" з підказкою-бульбашкою по ховеру/фокусу — для короткого
 * пояснення, яке не варто тримати завжди розгорнутим текстом під полем
 * (займає місце, повторюється на кожному курсі). CSS-only (.admin-info-tip*
 * у admin.css), клавіатурно доступна — сама іконка кнопка, бульбашка
 * з'являється і на :hover, і на :focus-within. */
function InfoTip({ text }) {
  return (
    <span className="admin-info-tip">
      <button type="button" className="admin-info-tip-icon" aria-label="Детальніше">
        <InfoIcon />
      </button>
      <span className="admin-info-tip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}

/**
 * Мотиваційні тости за серію правильних відповідей поспіль (streak) — з
 * конфеті, портовано з попередньої vanilla-JS розробки "8 кроків
 * телесейлінгу" (lib/streakMessages.js). Свідомо НЕ редактор довільного
 * списку (був ним, спростили за запитом) — просто перемикач: увімкнено
 * = курс отримує всі 10 готових порогів по наростанню (2, 3, 4… 12),
 * вимкнено = тостів не буде взагалі. Текст самих тостів міняється
 * централізовано в lib/streakMessages.js, не по одному в кожному курсі.
 */
function StreakMessagesField({ value, onChange }) {
  const enabled = Array.isArray(value) && value.length > 0;

  return (
    <div className="admin-field">
      <label className="admin-checkbox">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? STREAK_PRESET_MESSAGES : null)}
        />
        <span>Мотиваційні тости за серію відповідей</span>
        <InfoTip text="Банер з конфеті на 2, 5, 10-й правильній відповіді поспіль (далі що 5) і за ідеально пройдений модуль питань." />
      </label>
    </div>
  );
}

// otherSelected: чи вже щось обрано в сусідній картці ("За
// співробітниками") — якщо так, "не обрано" тут не показуємо: людина вже
// бачить, що призначення налаштовано (через конкретних людей), і друге
// "не обрано" поруч лише плутає, ніби взагалі нічого не вибрано.
function PositionsAccordionField({ positions, value, onChange, otherSelected }) {
  const names = positions.filter((p) => value.includes(p.code)).map((p) => p.name);
  const summary =
    names.length > 0
      ? names.length <= 2
        ? names.join(", ")
        : `${names.slice(0, 2).join(", ")} +${names.length - 2}`
      : otherSelected
        ? ""
        : "не обрано";

  function toggle(code) {
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  }

  return (
    <AccordionField title="За посадами" summary={summary}>
      <div className="admin-checkbox-grid">
        {positions.map((p) => (
          <label key={p.code} className="admin-checkbox">
            <input type="checkbox" checked={value.includes(p.code)} onChange={() => toggle(p.code)} />
            <span>{p.name}</span>
          </label>
        ))}
      </div>
    </AccordionField>
  );
}

// positionsSelected: чи вже обрано хоч одну посаду в сусідній картці —
// тоді порожній вибір тут означає щось конкретне ("всім із посади"), а не
// голе "не обрано" (та ж логіка узгодженості, що й у PositionsAccordionField).
function TerritoryAccordionField({ territories, employees, value, onChange, employeeValue, onEmployeeChange, positionsSelected }) {
  const byId = new Map(territories.map((t) => [t.id, t]));
  const employeesById = new Map(employees.map((e) => [e.id, e]));
  const names = [
    ...value.map((id) => byId.get(id)?.name),
    ...employeeValue.map((id) => employeesById.get(id)?.name),
  ].filter(Boolean);
  const summary =
    names.length > 0
      ? names.length <= 2
        ? names.join(", ")
        : `${names.slice(0, 2).join(", ")} +${names.length - 2}`
      : positionsSelected
        ? "всім із посади"
        : "";

  return (
    <AccordionField title="За співробітниками" summary={summary} footer="Порожньо = всім із обраної посади.">
      <TerritoryPicker
        territories={territories}
        employees={employees}
        value={value}
        onChange={onChange}
        employeeValue={employeeValue}
        onEmployeeChange={onEmployeeChange}
      />
    </AccordionField>
  );
}

function CourseCreateForm({ positions, territories, employees, onCreated, onCancel }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [isMandatory, setIsMandatory] = useState(false);
  const [deadlineDays, setDeadlineDays] = useState("");
  const [streakMessages, setStreakMessages] = useState(null);
  const [targetPositions, setTargetPositions] = useState([]);
  const [targetTerritories, setTargetTerritories] = useState([]);
  const [targetEmployeeIds, setTargetEmployeeIds] = useState([]);
  const [publishAt, setPublishAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!title.trim()) return;
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          category: category || null,
          isMandatory,
          deadlineDays: deadlineDays === "" ? null : Number(deadlineDays),
          streakMessages,
          targetPositions,
          targetTerritories,
          targetEmployeeIds,
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onCreated(await res.json());
    } catch (err) {
      setError("Помилка створення: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-course-settings" style={{ marginTop: 0 }}>
      <div className="admin-form-columns">
        <div className="admin-form-section">
          <span className="admin-form-section-title">Загальна інформація</span>
          <div className="admin-form-row">
            <div className="admin-field">
              <label className="admin-label">Назва курсу</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex" autoFocus />
            </div>
            <div className="admin-field">
              <label className="admin-label">Опис (необов&apos;язково)</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="admin-input-flex" />
            </div>
            <div className="admin-field">
              <label className="admin-label">Тема (необов&apos;язково)</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="admin-select" style={{ width: "100%" }}>
                <option value="">— без теми —</option>
                {COURSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="admin-form-section">
          <span className="admin-form-section-title">Розклад</span>
          <div className="admin-form-row">
            <div className="admin-field">
              <label className="admin-label">Дедлайн (днів на проходження)</label>
              <input
                type="number"
                min="0"
                value={deadlineDays}
                onChange={(e) => setDeadlineDays(e.target.value)}
                className="admin-input-flex"
                placeholder="без дедлайну"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">Дата публікації (авто-призначення)</label>
              <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="admin-input-flex" />
            </div>
          </div>
          <label className="admin-checkbox">
            <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} />
            <span>Обов&apos;язковий курс</span>
          </label>
          <StreakMessagesField value={streakMessages} onChange={setStreakMessages} />
        </div>

        <div className="admin-form-section">
          <span className="admin-form-section-title">Кому призначати</span>
          <PositionsAccordionField
            positions={positions}
            value={targetPositions}
            onChange={setTargetPositions}
            otherSelected={targetTerritories.length > 0 || targetEmployeeIds.length > 0}
          />
          <TerritoryAccordionField
            territories={territories}
            employees={employees}
            value={targetTerritories}
            onChange={setTargetTerritories}
            employeeValue={targetEmployeeIds}
            onEmployeeChange={setTargetEmployeeIds}
            positionsSelected={targetPositions.length > 0}
          />
        </div>
      </div>

      <div className="admin-status-line">
        {error && <span className="admin-error">{error}</span>}
        <span className="admin-btn-group">
          <button type="button" onClick={onCancel} className="admin-btn-link" title="Закрити форму без збереження">
            Скасувати
          </button>
          <button type="button" onClick={handleCreate} disabled={saving} className="admin-btn" title="Зберегти курс і додати його до списку">
            {saving && <SpinnerIcon />}
            {saving ? "Створення…" : "Створити курс"}
          </button>
        </span>
      </div>
    </div>
  );
}

/** Редагування налаштувань уже наявного курсу — той самий набір полів, що
 * й у CourseCreateForm, просто передзаповнений і зберігає через PATCH. */
function CourseSettingsBar({ course, positions, territories, employees, onSaved, onDeleted }) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description || "");
  const [category, setCategory] = useState(course.category || "");
  const [isMandatory, setIsMandatory] = useState(course.isMandatory);
  const [deadlineDays, setDeadlineDays] = useState(course.deadlineDays ?? "");
  const [streakMessages, setStreakMessages] = useState(course.streakMessages || null);
  const [targetPositions, setTargetPositions] = useState(course.targetPositions);
  const [targetTerritories, setTargetTerritories] = useState(course.targetTerritories);
  const [targetEmployeeIds, setTargetEmployeeIds] = useState(course.targetEmployeeIds || []);
  const [publishAt, setPublishAt] = useState(toDatetimeLocalValue(course.publishAt));
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState("");
  const [error, setError] = useState("");
  // Заблокований на видаленні курс (409 — є Enrollment) тримає тут їх
  // кількість, щоб показати ОКРЕМУ явну кнопку "Зняти призначення й
  // видалити" замість голого тексту помилки без жодної дії під нею.
  const [blockedEnrollmentCount, setBlockedEnrollmentCount] = useState(0);
  const [unassigning, setUnassigning] = useState(false);

  // "Кому призначати" вище — це лише збережений НАМІР (Course.targetPositions/
  // targetTerritories), сам по собі він НЕ створює Enrollment (звідси баг:
  // курс налаштований, а співробітник нічого не бачить). Реальне
  // призначення відбувається або тут, вручну, або автоматично по даті
  // публікації (cron, lib/courseAssignment.js publishScheduledCourses).
  async function handleAssignNow() {
    if (targetPositions.length === 0 && targetTerritories.length === 0 && targetEmployeeIds.length === 0) {
      setError("Спочатку оберіть хоча б одну посаду, територію або хоча б одну конкретну людину.");
      return;
    }
    setError("");
    setAssignResult("");
    setAssigning(true);
    try {
      const res = await fetch(`/api/admin/courses/${course.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionCodes: targetPositions, territoryIds: targetTerritories, employeeIds: targetEmployeeIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAssignResult(
        `Призначено ${data.assignedCount} співробітник(ів)${data.skippedCount > 0 ? `, ${data.skippedCount} вже мали це призначення раніше` : ""}.`
      );
    } catch (err) {
      setError("Помилка призначення: " + err.message);
    } finally {
      setAssigning(false);
    }
  }

  // Сам виклик DELETE, без confirm() — щоб handleUnassignAndDelete міг
  // повторити його одразу після зняття призначень, не показуючи другий
  // "ви впевнені?" одразу слідом за першим (той уже все сказав).
  async function performDelete() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/courses/${course.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 409 із enrollmentCount — курс не видалено САМЕ через реальні
        // призначення (не іншу помилку) — пропонуємо явну дію нижче,
        // а не лишаємо адміна з голим текстом помилки без жодної кнопки.
        if (res.status === 409 && data.enrollmentCount) {
          setBlockedEnrollmentCount(data.enrollmentCount);
          return;
        }
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setBlockedEnrollmentCount(0);
      onDeleted(course.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Видалити курс «${course.title}» повністю — разом з усіма модулями, екранами й компонентами? Це незворотно.`
      )
    ) {
      return;
    }
    setBlockedEnrollmentCount(0);
    await performDelete();
  }

  // Окремий явний крок: адмін підтверджує САМЕ зняття реальних призначень
  // (кожне — жива людина, яка бачила цей курс у себе в хабі), а не тихий
  // побічний ефект видалення курсу. Після зняття одразу пробуємо видалити
  // курс ще раз (тепер уже без 409), без другого підтвердження — перше
  // вже явно попередило, що курс після цього видалиться.
  async function handleUnassignAndDelete() {
    if (
      !confirm(
        `Зняти всі ${blockedEnrollmentCount} призначень цього курсу з реальних співробітників? Це незворотно — вони більше не побачать курс у себе. Курс після цього видалиться автоматично.`
      )
    ) {
      return;
    }
    setUnassigning(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/courses/${course.id}/enrollments`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setError("Помилка зняття призначень: " + err.message);
      setUnassigning(false);
      return;
    }
    setUnassigning(false);
    await performDelete();
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          category: category || null,
          isMandatory,
          deadlineDays: deadlineDays === "" ? null : Number(deadlineDays),
          streakMessages,
          targetPositions,
          targetTerritories,
          targetEmployeeIds,
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved(await res.json());
    } catch (err) {
      setError("Помилка збереження: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  const statusText = course.autoAssignedAt
    ? `Опубліковано ${new Date(course.autoAssignedAt).toLocaleString("uk-UA")}`
    : course.publishAt
      ? `Заплановано на ${new Date(course.publishAt).toLocaleString("uk-UA")}`
      : "Не заплановано — призначається лише вручну";

  return (
    <div className="admin-course-settings">
      <div className="admin-form-columns">
        <div className="admin-form-section">
          <span className="admin-form-section-title">Загальна інформація</span>
          <div className="admin-form-row">
            <div className="admin-field">
              <label className="admin-label">Назва курсу</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex" />
            </div>
            <div className="admin-field">
              <label className="admin-label">Опис (необов&apos;язково)</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="admin-input-flex" />
            </div>
            <div className="admin-field">
              <label className="admin-label">Тема (необов&apos;язково)</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="admin-select" style={{ width: "100%" }}>
                <option value="">— без теми —</option>
                {COURSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="admin-form-section">
          <span className="admin-form-section-title">Розклад</span>
          <div className="admin-form-row">
            <div className="admin-field">
              <label className="admin-label">Дедлайн (днів на проходження)</label>
              <input
                type="number"
                min="0"
                value={deadlineDays}
                onChange={(e) => setDeadlineDays(e.target.value)}
                className="admin-input-flex"
                placeholder="без дедлайну"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">Дата публікації (авто-призначення)</label>
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                className="admin-input-flex"
              />
            </div>
          </div>
          <label className="admin-checkbox">
            <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} />
            <span>Обов&apos;язковий курс</span>
          </label>
          <p className="admin-hint">{statusText}</p>
          <StreakMessagesField value={streakMessages} onChange={setStreakMessages} />
        </div>

        <div className="admin-form-section">
          <span className="admin-form-section-title">Кому призначати</span>
          <PositionsAccordionField
            positions={positions}
            value={targetPositions}
            onChange={setTargetPositions}
            otherSelected={targetTerritories.length > 0 || targetEmployeeIds.length > 0}
          />
          <TerritoryAccordionField
            territories={territories}
            employees={employees}
            value={targetTerritories}
            onChange={setTargetTerritories}
            employeeValue={targetEmployeeIds}
            onEmployeeChange={setTargetEmployeeIds}
            positionsSelected={targetPositions.length > 0}
          />
        </div>
      </div>

      {assignResult && <p className="admin-hint">{assignResult}</p>}

      {blockedEnrollmentCount > 0 && (
        <div className="admin-delete-blocked">
          <p>
            Курс не видалено: на нього призначено <b>{blockedEnrollmentCount}</b> співробітник(ів). Курс і
            призначення пов&apos;язані — щоб видалити курс, спершу треба зняти самі призначення (це прибере
            курс з хабу тих людей).
          </p>
          <span className="admin-btn-group">
            <button
              type="button"
              onClick={handleUnassignAndDelete}
              disabled={unassigning}
              className="admin-btn admin-btn-danger"
              title="Прибрати курс з хабу всіх призначених і видалити курс назавжди"
            >
              {unassigning && <SpinnerIcon />}
              {unassigning ? "Знімаю призначення…" : `Зняти ${blockedEnrollmentCount} призначень і видалити курс`}
            </button>
            <button type="button" onClick={() => setBlockedEnrollmentCount(0)} className="admin-btn-link" title="Лишити курс і призначення як є">
              Скасувати
            </button>
          </span>
        </div>
      )}

      <div className="admin-status-line">
        <span className="admin-error">{error}</span>
        <span className="admin-btn-group">
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="admin-btn admin-btn-danger"
            title="Видалити курс назавжди (заблоковано, якщо є активні призначення)"
          >
            {saving && <SpinnerIcon />}
            Видалити курс
          </button>
          <button
            type="button"
            onClick={handleAssignNow}
            disabled={assigning}
            className="admin-btn"
            title="Створити реальні призначення (Enrollment) для обраних посад/територій просто зараз"
          >
            {assigning && <SpinnerIcon />}
            {assigning ? "Призначення…" : "Призначити зараз"}
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="admin-btn" title="Зберегти зміни налаштувань курсу">
            {saving && <SpinnerIcon />}
            {saving ? "Збереження…" : "Зберегти налаштування"}
          </button>
        </span>
      </div>
    </div>
  );
}

function NewModuleInlineForm({ courseId, nextOrder, onCreated }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, title, order: nextOrder }),
      });
      if (res.ok) {
        setTitle("");
        onCreated(await res.json());
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-row admin-new-lesson">
      <input placeholder="Назва нового модуля" value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex" />
      <button type="button" onClick={handleCreate} disabled={saving} className="admin-btn" title="Створити новий модуль у цьому курсі">
        {saving && <SpinnerIcon />}
        {saving ? "Створення…" : "+ Додати модуль"}
      </button>
    </div>
  );
}

/** Список модулів курсу з перетягуванням (native HTML5 drag-and-drop —
 * бібліотека тут не потрібна, звичайний реордер невеликого списку). Після
 * drop — оптимістично оновлює порядок локально й одразу зберігає
 * order кожного модуля (1..N) через PATCH, щоб не розійтися з базою. */
function ModuleList({ courseId, modules, onReordered }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  async function persistOrder(reordered) {
    await Promise.all(
      reordered.map((courseModule, i) =>
        fetch(`/api/admin/modules/${courseModule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: i + 1 }),
        })
      )
    );
  }

  function handleDrop(targetIndex) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const reordered = [...modules];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const withOrder = reordered.map((m, i) => ({ ...m, order: i + 1 }));
    onReordered(withOrder);
    persistOrder(withOrder);
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <ul className="admin-block-list">
      {modules.map((courseModule, i) => (
        <li
          key={courseModule.id}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => {
            e.preventDefault();
            setOverIndex(i);
          }}
          onDragLeave={() => setOverIndex((v) => (v === i ? null : v))}
          onDrop={() => handleDrop(i)}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={`admin-block-list-item${overIndex === i && dragIndex !== null && dragIndex !== i ? " admin-drag-over" : ""}`}
        >
          <span className="admin-drag-handle" title="Перетягніть, щоб змінити порядок">
            <GripIcon />
          </span>
          <Link href={`/admin/courses/${courseId}?module=${courseModule.id}`} className="admin-block-list-link">
            {courseModule.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CourseRow({ course, positions, territories, employees, onModuleAdded, onModulesReordered, onCourseSaved, onCourseDeleted }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="admin-course-row">
      <button
        type="button"
        className="admin-course-list-link admin-course-row-toggle"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? "Згорнути список модулів курсу" : "Розгорнути список модулів курсу"}
      >
        <span>
          <span className={`admin-course-row-caret${expanded ? " open" : ""}`}>
            <ChevronIcon />
          </span>{" "}
          {course.title}
        </span>
        <span className="admin-hint">
          /{course.slug} · {course.modules.length} {course.modules.length === 1 ? "модуль" : "модулів"}
        </span>
      </button>

      {expanded && (
        <div className="admin-course-row-body">
          <CourseSettingsBar
            course={course}
            positions={positions}
            territories={territories}
            employees={employees}
            onSaved={(updated) => onCourseSaved(course.id, updated)}
            onDeleted={onCourseDeleted}
          />

          <label className="admin-label" style={{ marginTop: 10, display: "block" }}>
            Модулі
          </label>
          {course.modules.length === 0 ? (
            <p className="admin-hint">Модулів ще немає.</p>
          ) : (
            <ModuleList
              courseId={course.id}
              modules={course.modules}
              onReordered={(reordered) => onModulesReordered(course.id, reordered)}
            />
          )}
          <NewModuleInlineForm
            courseId={course.id}
            nextOrder={course.modules.length + 1}
            onCreated={(created) => onModuleAdded(course.id, created)}
          />
        </div>
      )}
    </li>
  );
}

export function AdminDashboard() {
  const [courses, setCourses] = useState(null);
  const [positions, setPositions] = useState([]);
  const [territories, setTerritories] = useState([]);
  // Співробітники з managerId — окремо від прив'язки до territoryId (та
  // дає лише "хто де сидить", ця — "хто кому підпорядковується"; на
  // листках дерева територій одне переходить в інше, див.
  // TerritoryPicker.jsx).
  const [employees, setEmployees] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/courses").then((r) => r.json()),
      fetch("/api/admin/positions").then((r) => r.json()),
      fetch("/api/admin/territories").then((r) => r.json()),
    ])
      .then(([coursesData, positionsData, territoriesData]) => {
        if (cancelled) return;
        setCourses(coursesData);
        setPositions(positionsData);
        setTerritories(territoriesData.territories);
        setEmployees(territoriesData.employees);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleModuleAdded(courseId, createdModule) {
    setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, modules: [...c.modules, createdModule] } : c)));
  }

  function handleModulesReordered(courseId, reorderedModules) {
    setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, modules: reorderedModules } : c)));
  }

  function handleCourseCreated(createdCourse) {
    setCourses((cs) => [...cs, createdCourse].sort((a, b) => a.title.localeCompare(b.title, "uk")));
    setShowCreate(false);
  }

  // PATCH /api/admin/courses/:id повертає курс БЕЗ modules — зберігаємо
  // наявні modules цього курсу, підмінюємо лише скалярні поля.
  function handleCourseSaved(courseId, updated) {
    setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, ...updated, modules: c.modules } : c)));
  }

  function handleCourseDeleted(courseId) {
    setCourses((cs) => cs.filter((c) => c.id !== courseId));
  }

  if (loadError) return <p className="admin-page admin-error">Не вдалося завантажити курси: {loadError}</p>;

  return (
    <div className="admin-page">
      <div className="admin-editor-header">
        <h1>Курси</h1>
        <button
          type="button"
          className="admin-btn"
          onClick={() => setShowCreate((v) => !v)}
          title={showCreate ? "Закрити форму без створення курсу" : "Відкрити форму створення нового курсу"}
        >
          {showCreate ? "Скасувати" : "+ Додати курс"}
        </button>
      </div>
      <p className="admin-subtitle">Оберіть курс, щоб розгорнути модулі, або модуль — щоб редагувати екрани та компоненти.</p>

      {showCreate && (
        <CourseCreateForm
          positions={positions}
          territories={territories}
          employees={employees}
          onCreated={handleCourseCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {!courses ? (
        <p>
          <SpinnerIcon />
          Завантаження…
        </p>
      ) : courses.length === 0 ? (
        <p>Курсів ще немає.</p>
      ) : (
        <ul className="admin-course-list">
          {courses.map((course) => (
            <CourseRow
              key={course.id}
              course={course}
              positions={positions}
              territories={territories}
              employees={employees}
              onModuleAdded={handleModuleAdded}
              onModulesReordered={handleModulesReordered}
              onCourseSaved={handleCourseSaved}
              onCourseDeleted={handleCourseDeleted}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
