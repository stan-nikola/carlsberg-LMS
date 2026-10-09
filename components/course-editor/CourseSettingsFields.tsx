"use client";

import { useState } from "react";
import { TerritoryPicker } from "@/components/TerritoryPicker";
import { AccordionField } from "@/components/AccordionField";
import { HintDot } from "@/components/HintDot";
import { CoursePacingCalculator } from "@/components/CoursePacingCalculator";
import { DEFAULT_PASS_THRESHOLD } from "@/lib/grading";
import { EMPLOYEE_DEPARTMENTS } from "@/lib/employeeDepartments";
import { STREAK_PRESET_MESSAGES } from "@/lib/streakMessages";

// Поля налаштувань курсу — одні на обидві форми /admin: створення
// (CourseCreateForm) і редагування (CourseSettingsBar). Форми відрізняються
// лише кнопками внизу й тим, куди йде запит.

const CERTIFICATE_HINT =
  "Сертифікат — PDF з ім'ям співробітника, назвою курсу й датою завершення. " +
  "Видається лише за 100% правильних відповідей: це свідомо вища планка, ніж прохідний бал " +
  "(той дає лише «залік»). Знята галочка прибирає кнопку завантаження з картки курсу.";
const FIRST_LOGIN_HINT =
  "Курс автоматично призначається кожному, хто вперше успішно увійшов на платформу. " +
  "Саме перший вхід, а не момент появи в базі: співробітники завантажуються пачками з HR-імпорту, " +
  "і призначення на тому етапі копило б прострочення тим, хто платформу ще не відкривав. " +
  "Діє разом зі звичайним призначенням за посадою/територією, не замість нього.";
const STREAK_HINT =
  "Повідомлення з конфеті на 2, 5, 10-й правильній відповіді поспіль (далі що 5) і за ідеально пройдений модуль питань.";

const HINTS = {
  title: "Назва, яку співробітник бачить на картці курсу в хабі та в списку призначень. Її ж підставляє лист і сповіщення про призначення.",
  description: "Один-два рядки під назвою: навіщо цей курс і кому. Видно на картці ще до того, як людина його відкрила.",
  category:
    "Департамент курсу. Показується тегом на картці в хабі і ЗВУЖУЄ списки в «Кому призначати» нижче — лишає тільки посади цього департаменту. Порожньо — тега немає, списки повні.",
  previewDevice:
    "Під який екран ви узгоджуєте вміст: прев'ю праворуч у конструкторі показує саме його. На реальний застосунок співробітника НЕ впливає — той підлаштовується під екран кожної людини сам.",
  deadlineDays:
    "Скільки днів дається на весь курс від дати призначення. Це єдиний ЖОРСТКИЙ термін: після нього курс стає простроченим. Дати по модулях — м'який орієнтир без штрафу.",
  moduleDays:
    "М'який графік: k-й модуль варто скласти до «дата призначення + k × цих днів». Штрафу немає — у плані курсу людина бачить лише «ви йдете за графіком» чи «відстаєте на N модулів». Порожньо — графіка немає.",
  modulePauseDays:
    "Наступний модуль відкриється не раніше ніж через стільки днів після СКЛАДАННЯ попереднього (не від дати призначення). Окремий модуль може задати власну паузу — вона має пріоритет над цією.",
  publishAt:
    "Курс сам призначиться всім із обраних нижче посад і територій у цю дату — щоденною перевіркою. Порожньо — призначення лише вручну кнопкою «Призначити зараз».",
  passThreshold:
    "Скільки відсотків питань треба відповісти правильно, щоб зарахувався модуль і курс у цілому. Сертифікат рахується окремо й видається лише за 100%.",
  points:
    "Скільки балів рейтингу дає складання саме цього курсу. Порожньо — береться загальне правило платформи для всіх курсів.",
  isMandatory:
    "Курс позначається обов'язковим на картці й потрапляє в лічильник «N обов'язкових курсів» на головній у співробітника. Доступ це не змінює — лише пріоритет і статистику.",
  assignTo:
    "Кому курс призначиться кнопкою «Призначити зараз» або в дату публікації. Це лише збережений намір: сам по собі список нікого не записує на курс. Якщо вище обрано департамент, тут лишились тільки його посади.",
  retryFreeAttempts:
    "Скільки разів підряд можна перескласти ПРОВАЛЕНИЙ модуль без паузи. Миттєвий повтор корисний для навчання, тому перші спроби вільні. Порожньо — обмеження немає зовсім, повтор завжди одразу.",
  retryCooldownHours:
    "Пауза після того, як вільні спроби скінчились. У годинах, а не днях: доба між спробами всередині робочого дня — завелика ціна за помилку, а година вже ламає перебір варіантів. Порожньо або 0 — паузи немає.",
  retrySection:
    "Світова практика ділиться надвоє. Сертифікаційні іспити ставлять паузу добу й більше, щоб не можна було заучити питання. Навчання на освоєння дає спроби без обмежень: постійна величина — знання, змінна — час. Тут другий випадок, тому дефолт — повтор одразу. Обмеження варто вмикати там, де питань у модулі мало: інакше варіанти просто перебирають. Разом із паузою працює «пул питань» у налаштуваннях модуля — з другої спроби питання інші.",
};

type Position = { code: string; name: string; department?: string | null };
type Territory = { id: number; name: string; parentId: number | null };
type Employee = {
  id: number;
  name: string;
  department?: string | null;
  positionName: string | null;
  territoryId: number | null;
  managerId: number | null;
};
/** Число з поля вводу: порожній рядок = «не задано». */
type NumberInput = number | string;

/** Курс, яким передзаповнюється форма редагування (GET /api/admin/courses). */
type CourseLike = {
  title: string;
  description?: string | null;
  category?: string | null;
  isMandatory: boolean;
  certificateEnabled?: boolean;
  assignOnFirstLogin?: boolean;
  deadlineDays?: number | null;
  moduleDays?: number | null;
  retryFreeAttempts?: number | null;
  retryCooldownHours?: number | null;
  modulePauseDays?: number | null;
  passThreshold?: number | null;
  points?: number | null;
  previewDevice?: string | null;
  streakMessages?: unknown[] | null;
  targetPositions: string[];
  targetTerritories: number[];
  targetEmployeeIds?: number[];
  publishAt?: string | null;
};

export type CourseFormValues = {
  title: string;
  description: string;
  category: string;
  isMandatory: boolean;
  certificateEnabled: boolean;
  assignOnFirstLogin: boolean;
  deadlineDays: NumberInput;
  moduleDays: NumberInput;
  retryFreeAttempts: NumberInput;
  retryCooldownHours: NumberInput;
  modulePauseDays: NumberInput;
  passThreshold: NumberInput;
  points: NumberInput;
  previewDevice: string;
  streakMessages: unknown[] | null;
  targetPositions: string[];
  targetTerritories: number[];
  targetEmployeeIds: number[];
  publishAt: string;
};

type SetField = <K extends keyof CourseFormValues>(field: K) => (value: CourseFormValues[K]) => void;

/** ISO-дата → значення <input type="datetime-local"> у місцевому часі. */
function toDatetimeLocalValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Без курсу — дефолти нового: обов'язковий, з тостами серії, телефон. */
function initialValues(course?: CourseLike): CourseFormValues {
  return {
    title: course?.title ?? "",
    description: course?.description || "",
    category: course?.category || "",
    isMandatory: course ? course.isMandatory : true,
    certificateEnabled: course?.certificateEnabled !== false,
    assignOnFirstLogin: Boolean(course?.assignOnFirstLogin),
    deadlineDays: course?.deadlineDays ?? "",
    moduleDays: course?.moduleDays ?? "",
    retryFreeAttempts: course?.retryFreeAttempts ?? "",
    retryCooldownHours: course?.retryCooldownHours ?? "",
    modulePauseDays: course?.modulePauseDays ?? "",
    passThreshold: course?.passThreshold ?? DEFAULT_PASS_THRESHOLD,
    points: course?.points ?? "",
    previewDevice: course?.previewDevice || "phone",
    streakMessages: course ? course.streakMessages || null : STREAK_PRESET_MESSAGES,
    targetPositions: course?.targetPositions ?? [],
    targetTerritories: course?.targetTerritories ?? [],
    targetEmployeeIds: course?.targetEmployeeIds ?? [],
    publishAt: toDatetimeLocalValue(course?.publishAt),
  };
}

export function useCourseForm(course?: CourseLike) {
  const [values, setValues] = useState(() => initialValues(course));
  const set: SetField = (field) => (value) => setValues((v) => ({ ...v, [field]: value }));
  return { values, set };
}

const numberOrNull = (v: NumberInput) => (v === "" ? null : Number(v));

/** Тіло POST/PATCH /api/admin/courses: порожні поля — null, дата — ISO. */
export function courseRequestBody(v: CourseFormValues) {
  return {
    title: v.title,
    description: v.description || null,
    category: v.category || null,
    isMandatory: v.isMandatory,
    certificateEnabled: v.certificateEnabled,
    assignOnFirstLogin: v.assignOnFirstLogin,
    deadlineDays: numberOrNull(v.deadlineDays),
    moduleDays: numberOrNull(v.moduleDays),
    retryFreeAttempts: numberOrNull(v.retryFreeAttempts),
    retryCooldownHours: numberOrNull(v.retryCooldownHours),
    modulePauseDays: numberOrNull(v.modulePauseDays),
    passThreshold: v.passThreshold === "" ? DEFAULT_PASS_THRESHOLD : Number(v.passThreshold),
    points: numberOrNull(v.points),
    previewDevice: v.previewDevice,
    streakMessages: v.streakMessages,
    targetPositions: v.targetPositions,
    targetTerritories: v.targetTerritories,
    targetEmployeeIds: v.targetEmployeeIds,
    publishAt: v.publishAt ? new Date(v.publishAt).toISOString() : null,
  };
}

/** «Ім'я, ім'я +N» для згорнутого акордеона. */
function summarize(names: string[], empty: string) {
  if (!names.length) return empty;
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

/**
 * otherSelected: чи вже щось обрано в сусідній картці («За співробітниками»)
 * — тоді «не обрано» тут не показуємо, воно лише плутало б. filterDepartment —
 * обраний департамент курсу: лишає посади лише цього департаменту.
 */
function PositionsAccordionField({
  positions,
  value,
  onChange,
  otherSelected,
  filterDepartment,
}: {
  positions: Position[];
  value: string[];
  onChange: (next: string[]) => void;
  otherSelected: boolean;
  filterDepartment: string | null;
}) {
  const visiblePositions = filterDepartment ? positions.filter((p) => p.department === filterDepartment) : positions;
  const names = visiblePositions.filter((p) => value.includes(p.code)).map((p) => p.name);
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <AccordionField title="За посадами" summary={summarize(names, otherSelected ? "" : "не обрано")}>
      <div className="admin-checkbox-grid">
        {visiblePositions.map((p) => (
          <label key={p.code} className="admin-checkbox">
            <input type="checkbox" checked={value.includes(p.code)} onChange={() => toggle(p.code)} />
            <span>{p.name}</span>
          </label>
        ))}
      </div>
    </AccordionField>
  );
}

/**
 * positionsSelected: чи обрано хоч одну посаду — тоді порожній вибір тут
 * означає «всім із посади». Департамент звужує лише список у пікері: імена
 * вже обраних людей беруться з повного списку, щоб не зникнути після зміни
 * департаменту курсу.
 */
function TerritoryAccordionField({
  territories,
  employees,
  value,
  onChange,
  employeeValue,
  onEmployeeChange,
  positionsSelected,
  filterDepartment,
}: {
  territories: Territory[];
  employees: Employee[];
  value: number[];
  onChange: (next: number[]) => void;
  employeeValue: number[];
  onEmployeeChange: (next: number[]) => void;
  positionsSelected: boolean;
  filterDepartment: string | null;
}) {
  const visibleEmployees = filterDepartment ? employees.filter((e) => e.department === filterDepartment) : employees;
  const territoryById = new Map(territories.map((t) => [t.id, t.name]));
  const employeeById = new Map(employees.map((e) => [e.id, e.name]));
  const names = [...value.map((id) => territoryById.get(id)), ...employeeValue.map((id) => employeeById.get(id))].filter(
    (name): name is string => Boolean(name),
  );

  return (
    <AccordionField
      title="За співробітниками"
      summary={summarize(names, positionsSelected ? "всім із посади" : "")}
      footer="Порожньо = всім із обраної посади."
    >
      <TerritoryPicker
        territories={territories}
        employees={visibleEmployees}
        value={value}
        onChange={onChange}
        employeeValue={employeeValue}
        onEmployeeChange={onEmployeeChange}
      />
    </AccordionField>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  max,
}: {
  label: string;
  hint: string;
  value: NumberInput;
  onChange: (value: string) => void;
  placeholder?: string;
  max?: number;
}) {
  return (
    <div className="admin-field">
      <label className="admin-label">
        {label} <HintDot align="start" text={hint} />
      </label>
      <input
        type="number"
        min="0"
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="admin-input-flex"
        placeholder={placeholder}
      />
    </div>
  );
}

/** Три колонки полів курсу: загальне + перескладання, розклад, кому призначати. */
export function CourseSettingsFields({
  values: v,
  set,
  positions,
  territories,
  employees,
  modules,
  statusText,
  autoFocusTitle,
}: {
  values: CourseFormValues;
  set: SetField;
  positions: Position[];
  territories: Territory[];
  employees: Employee[];
  /** Реальні модулі для калькулятора темпу; у новому курсі — порожньо. */
  modules: { id: number; title: string; order: number; cooldownDays: number | null }[];
  /** Стан публікації під розкладом (лише в наявного курсу). */
  statusText?: string;
  autoFocusTitle?: boolean;
}) {
  const department = v.category || null;
  return (
    <div className="admin-form-columns">
      <div className="admin-form-section">
        <span className="admin-form-section-title">Загальна інформація</span>
        <div className="admin-form-row">
          <div className="admin-field">
            <label className="admin-label">
              Назва курсу <HintDot align="start" text={HINTS.title} />
            </label>
            <input value={v.title} onChange={(e) => set("title")(e.target.value)} className="admin-input-flex" autoFocus={autoFocusTitle} />
          </div>
          <div className="admin-field">
            <label className="admin-label">
              Опис (необов&apos;язково) <HintDot align="start" text={HINTS.description} />
            </label>
            <input value={v.description} onChange={(e) => set("description")(e.target.value)} className="admin-input-flex" />
          </div>
          <div className="admin-field">
            <label className="admin-label">
              Департамент <HintDot align="start" text={HINTS.category} />
            </label>
            <select value={v.category} onChange={(e) => set("category")(e.target.value)} className="admin-select" style={{ width: "100%" }}>
              <option value="">— без департаменту —</option>
              {EMPLOYEE_DEPARTMENTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            {/* Лише намір для прев'ю в конструкторі (course-editor/preview.tsx):
                застосунок співробітника сам підлаштовується під його екран. */}
            <label className="admin-label">
              Платформа конструктора <HintDot align="start" text={HINTS.previewDevice} />
            </label>
            <select
              value={v.previewDevice}
              onChange={(e) => set("previewDevice")(e.target.value)}
              className="admin-select"
              style={{ width: "100%" }}
            >
              <option value="phone">Мобільний</option>
              <option value="laptop">Ноутбук</option>
            </select>
          </div>
        </div>
        {/* Тости за серію правильних відповідей: не редактор списку, а
            перемикач готових порогів (тексти — lib/streakMessages). */}
        <div className="admin-field">
          <label className="admin-checkbox admin-checkbox-wrap">
            <input
              type="checkbox"
              checked={Array.isArray(v.streakMessages) && v.streakMessages.length > 0}
              onChange={(e) => set("streakMessages")(e.target.checked ? STREAK_PRESET_MESSAGES : null)}
            />
            <span>Повідомлення за серію правильних відповідей</span>
            <HintDot align="start" text={STREAK_HINT} />
          </label>
        </div>

        <div className="admin-form-subsection">
          <span className="admin-form-section-title">
            Перескладання <HintDot align="start" text={HINTS.retrySection} />
          </span>
          <p className="admin-hint">
            Діє на модуль, який НЕ склали. Для вже складеного модуля працює інше правило — «пауза перед
            повторним проходженням» у налаштуваннях самого модуля.
          </p>
          <div className="admin-form-row">
            <NumberField
              label="Спроб підряд без паузи"
              hint={HINTS.retryFreeAttempts}
              value={v.retryFreeAttempts}
              onChange={set("retryFreeAttempts")}
              placeholder="без обмежень"
            />
            <NumberField
              label="Пауза після них (годин)"
              hint={HINTS.retryCooldownHours}
              value={v.retryCooldownHours}
              onChange={set("retryCooldownHours")}
              placeholder="без паузи"
            />
          </div>
        </div>
      </div>

      <div className="admin-form-section">
        <span className="admin-form-section-title">Розклад</span>
        <div className="admin-form-row">
          <NumberField
            label="Дедлайн (днів на проходження)"
            hint={HINTS.deadlineDays}
            value={v.deadlineDays}
            onChange={set("deadlineDays")}
            placeholder="без дедлайну"
          />
          <NumberField
            label="Рекомендовано днів на модуль"
            hint={HINTS.moduleDays}
            value={v.moduleDays}
            onChange={set("moduleDays")}
            placeholder="без графіка"
          />
          <NumberField
            label="Мінімальна пауза перед наступним модулем (днів)"
            hint={HINTS.modulePauseDays}
            value={v.modulePauseDays}
            onChange={set("modulePauseDays")}
            placeholder="0"
          />
          <div className="admin-field">
            <label className="admin-label">
              Дата публікації (авто-призначення) <HintDot align="start" text={HINTS.publishAt} />
            </label>
            <input type="datetime-local" value={v.publishAt} onChange={(e) => set("publishAt")(e.target.value)} className="admin-input-flex" />
          </div>
          <NumberField label="Прохідний бал (%)" hint={HINTS.passThreshold} value={v.passThreshold} onChange={set("passThreshold")} max={100} />
          <NumberField
            label="Бали рейтингу (порожньо = за правилом)"
            hint={HINTS.points}
            value={v.points}
            onChange={set("points")}
            placeholder="100"
          />
        </div>
        <CoursePacingCalculator
          modules={modules}
          moduleDays={v.moduleDays}
          pauseDays={v.modulePauseDays}
          deadlineDays={v.deadlineDays}
          onSuggestDeadline={(d) => set("deadlineDays")(String(d))}
        />
        {statusText && (
          <p className="admin-hint" style={{ fontSize: "0.8em" }}>
            {statusText}
          </p>
        )}
        <label className="admin-checkbox">
          <input type="checkbox" checked={v.isMandatory} onChange={(e) => set("isMandatory")(e.target.checked)} />
          <span>Обов&apos;язковий курс</span>
          <HintDot align="start" text={HINTS.isMandatory} />
        </label>
        <label className="admin-checkbox">
          <input type="checkbox" checked={v.certificateEnabled} onChange={(e) => set("certificateEnabled")(e.target.checked)} />
          <span>Видавати сертифікат за проходження</span>
          <HintDot text={CERTIFICATE_HINT} align="start" />
        </label>
      </div>

      <div className="admin-form-section">
        <span className="admin-form-section-title">
          Кому призначати <HintDot align="start" text={HINTS.assignTo} />
        </span>
        <label className="admin-checkbox">
          <input type="checkbox" checked={v.assignOnFirstLogin} onChange={(e) => set("assignOnFirstLogin")(e.target.checked)} />
          <span>Новоприбулим на платформу</span>
          <HintDot text={FIRST_LOGIN_HINT} align="start" />
        </label>
        <PositionsAccordionField
          positions={positions}
          value={v.targetPositions}
          onChange={set("targetPositions")}
          otherSelected={v.targetTerritories.length > 0 || v.targetEmployeeIds.length > 0}
          filterDepartment={department}
        />
        <TerritoryAccordionField
          territories={territories}
          employees={employees}
          value={v.targetTerritories}
          onChange={set("targetTerritories")}
          employeeValue={v.targetEmployeeIds}
          onEmployeeChange={set("targetEmployeeIds")}
          positionsSelected={v.targetPositions.length > 0}
          filterDepartment={department}
        />
      </div>
    </div>
  );
}
