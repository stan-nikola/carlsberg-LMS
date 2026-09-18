"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  GripIcon,
  ChevronIcon,
  SpinnerIcon,
  InfoIcon,
  FolderIcon,
  RootIcon,
  ArrowBackIcon,
  GridViewIcon,
  ListViewIcon,
  CourseIcon,
  PencilIcon,
  XIcon,
} from "@/components/icons";
import { TerritoryPicker } from "@/components/TerritoryPicker";
import { AccordionField } from "@/components/AccordionField";
import { pluralize } from "@/lib/pluralize";
import { HintDot } from "@/components/HintDot";
import { CoursePacingCalculator } from "@/components/CoursePacingCalculator";
import { EMPLOYEE_DEPARTMENTS } from "@/lib/employeeDepartments";
import { STREAK_PRESET_MESSAGES } from "@/lib/streakMessages";

// Дашборд /admin: курси розгортаються списком своїх модулів (клік по
// заголовку курсу), клік по модулю веде в редактор курсу (components/
// AdminCourseEditor.jsx) одразу до цього модуля (?module=ID). Тут же — форми
// створення нового курсу (назва + всі атрибути, як у CourseSettingsBar
// редактора) і нового модуля всередині вже наявного курсу.

// Пояснення до двох прапорців курсу — один текст на обидві форми
// (створення і редагування), щоб вони не розійшлися формулюванням.
const CERTIFICATE_HINT =
  "Сертифікат — PDF з ім'ям співробітника, назвою курсу й датою завершення. " +
  "Видається лише за 100% правильних відповідей: це свідомо вища планка, ніж прохідний бал " +
  "(той дає лише «залік»). Знята галочка прибирає кнопку завантаження з картки курсу.";
const FIRST_LOGIN_HINT =
  "Курс автоматично призначається кожному, хто вперше успішно увійшов на платформу. " +
  "Саме перший вхід, а не момент появи в базі: співробітники завантажуються пачками з HR-імпорту, " +
  "і призначення на тому етапі копило б прострочення тим, хто платформу ще не відкривав. " +
  "Діє разом зі звичайним призначенням за посадою/територією, не замість нього.";

// Підказки до полів курсу. Одне джерело на обидві форми — інакше
// формулювання розходяться, і той самий регулятор пояснено по-різному.
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

// Кольорова "схема" для іконок папок у сітці Провідника — різні папки
// різного кольору для швидкої візуальної орієнтації (як кольорові папки в
// Google Drive/Windows), а не всі однаковим --gold. Лише реальні токени
// tokens.css, БЕЗ --cb-fail (в цьому ж компоненті червоний вже означає
// "видалити" — колір-код папки не повинен конфліктувати з цим значенням).
// Прив'язка до folder.id (не до індексу в масиві) — колір лишається
// стабільним для конкретної папки навіть коли список пересортовується
// (API віддає папки за назвою, alphabetically) або поповнюється новими.
const FOLDER_TILE_COLORS = [
  "var(--cb-tertiary)",
  "var(--cb-notification)",
  "var(--cb-secondary)",
  "var(--cb-alert)",
  "var(--cb-primary)",
  "var(--cb-success)",
];
function folderTileColor(folderId) {
  const idx = ((folderId % FOLDER_TILE_COLORS.length) + FOLDER_TILE_COLORS.length) % FOLDER_TILE_COLORS.length;
  return FOLDER_TILE_COLORS[idx];
}

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
      <label className="admin-checkbox admin-checkbox-wrap">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? STREAK_PRESET_MESSAGES : null)}
        />
        <span>Повідомлення за серію правильних відповідей</span>
        <InfoTip text="Повідомлення з конфеті на 2, 5, 10-й правильній відповіді поспіль (далі що 5) і за ідеально пройдений модуль питань." />
      </label>
    </div>
  );
}

// otherSelected: чи вже щось обрано в сусідній картці ("За
// співробітниками") — якщо так, "не обрано" тут не показуємо: людина вже
// бачить, що призначення налаштовано (через конкретних людей), і друге
// "не обрано" поруч лише плутає, ніби взагалі нічого не вибрано.
// filterDepartment — обраний Course.category (лейбл "Департамент"):
// звужує список до посад ЦЬОГО департаменту (Position.department), щоб не
// пропонувати, наприклад, збутові посади для HR-курсу. Порожній
// filterDepartment ("необов'язково" не обрано) — показує всі посади, як і
// раніше.
function PositionsAccordionField({ positions, value, onChange, otherSelected, filterDepartment }) {
  const visiblePositions = filterDepartment ? positions.filter((p) => p.department === filterDepartment) : positions;
  const names = visiblePositions.filter((p) => value.includes(p.code)).map((p) => p.name);
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

// positionsSelected: чи вже обрано хоч одну посаду в сусідній картці —
// тоді порожній вибір тут означає щось конкретне ("всім із посади"), а не
// голе "не обрано" (та ж логіка узгодженості, що й у PositionsAccordionField).
function TerritoryAccordionField({
  territories,
  employees,
  value,
  onChange,
  employeeValue,
  onEmployeeChange,
  positionsSelected,
  filterDepartment,
}) {
  // Той самий принцип, що в PositionsAccordionField — звужуємо список до
  // обраного департаменту, але лише для ВІДОБРАЖЕННЯ в пікері: мапа імен
  // (employeesById) лишається на повному списку, щоб уже обрані раніше
  // employeeValue коректно показували ім'я навіть якщо департамент курсу
  // потім змінили.
  const visibleEmployees = filterDepartment ? employees.filter((e) => e.department === filterDepartment) : employees;
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
        employees={visibleEmployees}
        value={value}
        onChange={onChange}
        employeeValue={employeeValue}
        onEmployeeChange={onEmployeeChange}
      />
    </AccordionField>
  );
}

function CourseCreateForm({ positions, territories, employees, folderId, onCreated, onCancel }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [isMandatory, setIsMandatory] = useState(true);
  const [certificateEnabled, setCertificateEnabled] = useState(true);
  const [assignOnFirstLogin, setAssignOnFirstLogin] = useState(false);
  const [deadlineDays, setDeadlineDays] = useState("");
  const [moduleDays, setModuleDays] = useState("");
  const [retryFreeAttempts, setRetryFreeAttempts] = useState("");
  const [retryCooldownHours, setRetryCooldownHours] = useState("");
  const [modulePauseDays, setModulePauseDays] = useState("");
  const [passThreshold, setPassThreshold] = useState(80);
  const [points, setPoints] = useState("");
  const [previewDevice, setPreviewDevice] = useState("phone");
  const [streakMessages, setStreakMessages] = useState(STREAK_PRESET_MESSAGES);
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
          certificateEnabled,
          assignOnFirstLogin,
          deadlineDays: deadlineDays === "" ? null : Number(deadlineDays),
          moduleDays: moduleDays === "" ? null : Number(moduleDays),
          retryFreeAttempts: retryFreeAttempts === "" ? null : Number(retryFreeAttempts),
          retryCooldownHours: retryCooldownHours === "" ? null : Number(retryCooldownHours),
          modulePauseDays: modulePauseDays === "" ? null : Number(modulePauseDays),
          passThreshold: passThreshold === "" ? 80 : Number(passThreshold),
          points: points === "" ? null : Number(points),
          previewDevice,
          streakMessages,
          targetPositions,
          targetTerritories,
          targetEmployeeIds,
          publishAt: publishAt ? new Date(publishAt).toISOString() : null,
          folderId,
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
              <label className="admin-label">
                Назва курсу <HintDot align="start" text={HINTS.title} />
              </label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex" autoFocus />
            </div>
            <div className="admin-field">
              <label className="admin-label">
                Опис (необов&apos;язково) <HintDot align="start" text={HINTS.description} />
              </label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="admin-input-flex" />
            </div>
            <div className="admin-field">
              <label className="admin-label">
                Департамент <HintDot align="start" text={HINTS.category} />
              </label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="admin-select" style={{ width: "100%" }}>
                <option value="">— без департаменту —</option>
                {EMPLOYEE_DEPARTMENTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              {/* Під який екран НАСАМПЕРЕД узгоджували контент — лише
                  прапорець-намір для прев'ю в конструкторі
                  (components/AdminCourseEditor.jsx), реальний застосунок
                  співробітника сам адаптується під його справжній екран
                  незалежно від цього вибору. */}
              <label className="admin-label">
                Платформа конструктора <HintDot align="start" text={HINTS.previewDevice} />
              </label>
              <select
                value={previewDevice}
                onChange={(e) => setPreviewDevice(e.target.value)}
                className="admin-select"
                style={{ width: "100%" }}
              >
                <option value="phone">Мобільний</option>
                <option value="laptop">Ноутбук</option>
              </select>
            </div>
          </div>
          <StreakMessagesField value={streakMessages} onChange={setStreakMessages} />

          <div className="admin-form-subsection">
            <span className="admin-form-section-title">
              Перескладання <HintDot align="start" text={HINTS.retrySection} />
            </span>
            <p className="admin-hint">
              Діє на модуль, який НЕ склали. Для вже складеного модуля працює інше правило — «пауза перед
              повторним проходженням» у налаштуваннях самого модуля.
            </p>
            <div className="admin-form-row">
              <div className="admin-field">
                <label className="admin-label">
                  Спроб підряд без паузи <HintDot align="start" text={HINTS.retryFreeAttempts} />
                </label>
                <input
                  type="number"
                  min="0"
                  value={retryFreeAttempts}
                  onChange={(e) => setRetryFreeAttempts(e.target.value)}
                  className="admin-input-flex"
                  placeholder="без обмежень"
                />
              </div>
              <div className="admin-field">
                <label className="admin-label">
                  Пауза після них (годин) <HintDot align="start" text={HINTS.retryCooldownHours} />
                </label>
                <input
                  type="number"
                  min="0"
                  value={retryCooldownHours}
                  onChange={(e) => setRetryCooldownHours(e.target.value)}
                  className="admin-input-flex"
                  placeholder="без паузи"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="admin-form-section">
          <span className="admin-form-section-title">Розклад</span>
          <div className="admin-form-row">
            <div className="admin-field">
              <label className="admin-label">
                Дедлайн (днів на проходження) <HintDot align="start" text={HINTS.deadlineDays} />
              </label>
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
              <label className="admin-label">
                Рекомендовано днів на модуль <HintDot align="start" text={HINTS.moduleDays} />
              </label>
              <input
                type="number"
                min="0"
                value={moduleDays}
                onChange={(e) => setModuleDays(e.target.value)}
                className="admin-input-flex"
                placeholder="без графіка"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">
                Мінімальна пауза перед наступним модулем (днів) <HintDot align="start" text={HINTS.modulePauseDays} />
              </label>
              <input
                type="number"
                min="0"
                value={modulePauseDays}
                onChange={(e) => setModulePauseDays(e.target.value)}
                className="admin-input-flex"
                placeholder="0"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">
                Дата публікації (авто-призначення) <HintDot align="start" text={HINTS.publishAt} />
              </label>
              <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="admin-input-flex" />
            </div>
            <div className="admin-field">
              <label className="admin-label">
                Прохідний бал (%) <HintDot align="start" text={HINTS.passThreshold} />
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={passThreshold}
                onChange={(e) => setPassThreshold(e.target.value)}
                className="admin-input-flex"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">
                Бали рейтингу (порожньо = за правилом) <HintDot align="start" text={HINTS.points} />
              </label>
              <input type="number" min="0" value={points} onChange={(e) => setPoints(e.target.value)} className="admin-input-flex" placeholder="100" />
            </div>
          </div>
          <CoursePacingCalculator
            modules={[]}
            moduleDays={moduleDays}
            pauseDays={modulePauseDays}
            deadlineDays={deadlineDays}
            onSuggestDeadline={(d) => setDeadlineDays(String(d))}
          />
          <label className="admin-checkbox">
            <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} />
            <span>Обов&apos;язковий курс</span>
            <HintDot align="start" text={HINTS.isMandatory} />
          </label>
          <label className="admin-checkbox">
            <input type="checkbox" checked={certificateEnabled} onChange={(e) => setCertificateEnabled(e.target.checked)} />
            <span>Видавати сертифікат за проходження</span>
            <HintDot text={CERTIFICATE_HINT} align="start" />
          </label>
        </div>

        <div className="admin-form-section">
          <span className="admin-form-section-title">
            Кому призначати <HintDot align="start" text={HINTS.assignTo} />
          </span>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={assignOnFirstLogin}
              onChange={(e) => setAssignOnFirstLogin(e.target.checked)}
            />
            <span>Новоприбулим на платформу</span>
            <HintDot text={FIRST_LOGIN_HINT} align="start" />
          </label>
          <PositionsAccordionField
            positions={positions}
            value={targetPositions}
            onChange={setTargetPositions}
            otherSelected={targetTerritories.length > 0 || targetEmployeeIds.length > 0}
            filterDepartment={category || null}
          />
          <TerritoryAccordionField
            territories={territories}
            employees={employees}
            value={targetTerritories}
            onChange={setTargetTerritories}
            employeeValue={targetEmployeeIds}
            onEmployeeChange={setTargetEmployeeIds}
            positionsSelected={targetPositions.length > 0}
            filterDepartment={category || null}
          />
        </div>
      </div>

      <div className="admin-status-line">
        {error && <span className="admin-error">{error}</span>}
        <span className="admin-btn-group">
          <button type="button" onClick={handleCreate} disabled={saving} className="admin-btn" title="Зберегти курс і додати його до списку">
            {saving && <SpinnerIcon />}
            {saving ? "Створення…" : "Створити курс"}
          </button>
          <button type="button" onClick={onCancel} className="admin-btn-danger" title="Закрити форму без збереження">
            Скасувати
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
  const [certificateEnabled, setCertificateEnabled] = useState(course.certificateEnabled !== false);
  const [assignOnFirstLogin, setAssignOnFirstLogin] = useState(Boolean(course.assignOnFirstLogin));
  const [deadlineDays, setDeadlineDays] = useState(course.deadlineDays ?? "");
  const [moduleDays, setModuleDays] = useState(course.moduleDays ?? "");
  const [retryFreeAttempts, setRetryFreeAttempts] = useState(course.retryFreeAttempts ?? "");
  const [retryCooldownHours, setRetryCooldownHours] = useState(course.retryCooldownHours ?? "");
  const [modulePauseDays, setModulePauseDays] = useState(course.modulePauseDays ?? "");
  const [passThreshold, setPassThreshold] = useState(course.passThreshold ?? 80);
  const [points, setPoints] = useState(course.points ?? "");
  const [previewDevice, setPreviewDevice] = useState(course.previewDevice || "phone");
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
          certificateEnabled,
          assignOnFirstLogin,
          deadlineDays: deadlineDays === "" ? null : Number(deadlineDays),
          moduleDays: moduleDays === "" ? null : Number(moduleDays),
          retryFreeAttempts: retryFreeAttempts === "" ? null : Number(retryFreeAttempts),
          retryCooldownHours: retryCooldownHours === "" ? null : Number(retryCooldownHours),
          modulePauseDays: modulePauseDays === "" ? null : Number(modulePauseDays),
          passThreshold: passThreshold === "" ? 80 : Number(passThreshold),
          points: points === "" ? null : Number(points),
          previewDevice,
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
              <label className="admin-label">
                Назва курсу <HintDot align="start" text={HINTS.title} />
              </label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input-flex" />
            </div>
            <div className="admin-field">
              <label className="admin-label">
                Опис (необов&apos;язково) <HintDot align="start" text={HINTS.description} />
              </label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="admin-input-flex" />
            </div>
            <div className="admin-field">
              <label className="admin-label">
                Департамент <HintDot align="start" text={HINTS.category} />
              </label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="admin-select" style={{ width: "100%" }}>
                <option value="">— без департаменту —</option>
                {EMPLOYEE_DEPARTMENTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              {/* Під який екран НАСАМПЕРЕД узгоджували контент — лише
                  прапорець-намір для прев'ю в конструкторі
                  (components/AdminCourseEditor.jsx), реальний застосунок
                  співробітника сам адаптується під його справжній екран
                  незалежно від цього вибору. */}
              <label className="admin-label">
                Платформа конструктора <HintDot align="start" text={HINTS.previewDevice} />
              </label>
              <select
                value={previewDevice}
                onChange={(e) => setPreviewDevice(e.target.value)}
                className="admin-select"
                style={{ width: "100%" }}
              >
                <option value="phone">Мобільний</option>
                <option value="laptop">Ноутбук</option>
              </select>
            </div>
          </div>
          <StreakMessagesField value={streakMessages} onChange={setStreakMessages} />

          <div className="admin-form-subsection">
            <span className="admin-form-section-title">
              Перескладання <HintDot align="start" text={HINTS.retrySection} />
            </span>
            <p className="admin-hint">
              Діє на модуль, який НЕ склали. Для вже складеного модуля працює інше правило — «пауза перед
              повторним проходженням» у налаштуваннях самого модуля.
            </p>
            <div className="admin-form-row">
              <div className="admin-field">
                <label className="admin-label">
                  Спроб підряд без паузи <HintDot align="start" text={HINTS.retryFreeAttempts} />
                </label>
                <input
                  type="number"
                  min="0"
                  value={retryFreeAttempts}
                  onChange={(e) => setRetryFreeAttempts(e.target.value)}
                  className="admin-input-flex"
                  placeholder="без обмежень"
                />
              </div>
              <div className="admin-field">
                <label className="admin-label">
                  Пауза після них (годин) <HintDot align="start" text={HINTS.retryCooldownHours} />
                </label>
                <input
                  type="number"
                  min="0"
                  value={retryCooldownHours}
                  onChange={(e) => setRetryCooldownHours(e.target.value)}
                  className="admin-input-flex"
                  placeholder="без паузи"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="admin-form-section">
          <span className="admin-form-section-title">Розклад</span>
          <div className="admin-form-row">
            <div className="admin-field">
              <label className="admin-label">
                Дедлайн (днів на проходження) <HintDot align="start" text={HINTS.deadlineDays} />
              </label>
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
              <label className="admin-label">
                Рекомендовано днів на модуль <HintDot align="start" text={HINTS.moduleDays} />
              </label>
              <input
                type="number"
                min="0"
                value={moduleDays}
                onChange={(e) => setModuleDays(e.target.value)}
                className="admin-input-flex"
                placeholder="без графіка"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">
                Мінімальна пауза перед наступним модулем (днів) <HintDot align="start" text={HINTS.modulePauseDays} />
              </label>
              <input
                type="number"
                min="0"
                value={modulePauseDays}
                onChange={(e) => setModulePauseDays(e.target.value)}
                className="admin-input-flex"
                placeholder="0"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">
                Дата публікації (авто-призначення) <HintDot align="start" text={HINTS.publishAt} />
              </label>
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                className="admin-input-flex"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">
                Прохідний бал (%) <HintDot align="start" text={HINTS.passThreshold} />
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={passThreshold}
                onChange={(e) => setPassThreshold(e.target.value)}
                className="admin-input-flex"
              />
            </div>
            <div className="admin-field">
              <label className="admin-label">
                Бали рейтингу (порожньо = за правилом) <HintDot align="start" text={HINTS.points} />
              </label>
              <input type="number" min="0" value={points} onChange={(e) => setPoints(e.target.value)} className="admin-input-flex" placeholder="100" />
            </div>
          </div>
          <CoursePacingCalculator
            modules={course.modules || []}
            moduleDays={moduleDays}
            pauseDays={modulePauseDays}
            deadlineDays={deadlineDays}
            onSuggestDeadline={(d) => setDeadlineDays(String(d))}
          />
          <p className="admin-hint" style={{ fontSize: "0.8em" }}>{statusText}</p>
          <label className="admin-checkbox">
            <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} />
            <span>Обов&apos;язковий курс</span>
            <HintDot align="start" text={HINTS.isMandatory} />
          </label>
          <label className="admin-checkbox">
            <input type="checkbox" checked={certificateEnabled} onChange={(e) => setCertificateEnabled(e.target.checked)} />
            <span>Видавати сертифікат за проходження</span>
            <HintDot text={CERTIFICATE_HINT} align="start" />
          </label>
        </div>

        <div className="admin-form-section">
          <span className="admin-form-section-title">
            Кому призначати <HintDot align="start" text={HINTS.assignTo} />
          </span>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={assignOnFirstLogin}
              onChange={(e) => setAssignOnFirstLogin(e.target.checked)}
            />
            <span>Новоприбулим на платформу</span>
            <HintDot text={FIRST_LOGIN_HINT} align="start" />
          </label>
          <PositionsAccordionField
            positions={positions}
            value={targetPositions}
            onChange={setTargetPositions}
            otherSelected={targetTerritories.length > 0 || targetEmployeeIds.length > 0}
            filterDepartment={category || null}
          />
          <TerritoryAccordionField
            territories={territories}
            employees={employees}
            value={targetTerritories}
            onChange={setTargetTerritories}
            employeeValue={targetEmployeeIds}
            onEmployeeChange={setTargetEmployeeIds}
            positionsSelected={targetPositions.length > 0}
            filterDepartment={category || null}
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

      <div className="admin-status-line admin-status-line-reverse">
        <span className="admin-error">{error}</span>
        <span className="admin-btn-group">
          <button type="button" onClick={handleSave} disabled={saving} className="admin-btn" title="Зберегти зміни налаштувань курсу">
            {saving && <SpinnerIcon />}
            {saving ? "Збереження…" : "Зберегти налаштування"}
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

function CourseRow({
  course,
  positions,
  territories,
  employees,
  onModuleAdded,
  onModulesReordered,
  onCourseSaved,
  onCourseDeleted,
  onDragStart,
  onDragEnd,
  initialExpanded,
}) {
  // initialExpanded — лише ПОЧАТКОВЕ значення (щойно створений курс
  // одразу відкритий); далі рядок керує своїм expanded сам, як і раніше.
  const [expanded, setExpanded] = useState(initialExpanded || false);

  return (
    <li className="admin-course-row" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <button
        type="button"
        className="admin-course-list-link admin-course-row-toggle"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? "Згорнути список модулів курсу" : "Розгорнути список модулів курсу"}
      >
        <span>
          <span className="admin-drag-handle" title="Перетягніть у папку">
            <GripIcon />
          </span>
          <span className={`admin-course-row-caret${expanded ? " open" : ""}`}>
            <ChevronIcon />
          </span>{" "}
          {course.title}
        </span>
        <span className="admin-hint">
          /{course.slug} · {pluralize(course.modules.length, "модуль", "модулі", "модулів")} · Призначено:{" "}
          {course._count?.enrollments ?? 0}
          {/* Дата створення — лише в списковому виді: у плитці на неї
              просто немає рядка, а тут вона потрібна, щоб сортування "за
              датою" можна було перевірити очима, а не лише повірити
              порядку. */}
          {course.createdAt && ` · Створено ${new Date(course.createdAt).toLocaleDateString("uk-UA")}`}
        </span>
      </button>

      {expanded && (
        <CourseExpandedBody
          course={course}
          positions={positions}
          territories={territories}
          employees={employees}
          onModuleAdded={onModuleAdded}
          onModulesReordered={onModulesReordered}
          onCourseSaved={onCourseSaved}
          onCourseDeleted={onCourseDeleted}
        />
      )}
    </li>
  );
}

/** Налаштування курсу + список модулів — тіло розгортання. Винесено
 * окремо від CourseRow (список), бо в сітковому виді (Фаза E, "провідник
 * файлів") клік по плитці курсу теж розгортає це саме тіло, але ПІД
 * усією сіткою (одну плитку розтягувати всередині grid — зламало б
 * розкладку сусідніх плиток), а не всередині рядка. */
function CourseExpandedBody({ course, positions, territories, employees, onModuleAdded, onModulesReordered, onCourseSaved, onCourseDeleted }) {
  return (
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
  // Пошук/фільтр каталогу (Фаза E адмінки) — клієнтський, не серверний:
  // курсів у каталозі одиниці-десятки (не 1900+, як співробітників), окремий
  // API-запит на кожен натиск клавіші тут був би зайвим.
  const [courseQuery, setCourseQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Папки каталогу (провідник файлів для курсів) — плаский список,
  // дерево/breadcrumb будуються з нього клієнтськи (той самий підхід, що
  // territories у TerritoryPicker.jsx). currentFolderId: null — корінь.
  const [folders, setFolders] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  // draggedItem: { type: "course"|"folder", id } | null — той самий
  // патерн, що EmployeeTree.jsx (стан замість dataTransfer, бо drag і
  // drop завжди в межах одного компонента).
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(undefined); // undefined — нічого не підсвічено, null — сам корінь

  // Сітка плиток "як провідник файлів" (за погодженням з користувачем) —
  // за замовчуванням, з перемикачем назад на компактний список.
  const [viewMode, setViewMode] = useState("grid");
  // Порядок каталогу. "title" — дефолт, той самий, у якому курси
  // приходять з API (orderBy: title asc), тож перший рендер нічого не
  // переставляє. Сортування клієнтське: увесь каталог і так уже в
  // пам'яті (одним запитом), ходити на сервер за порядком нема потреби.
  const [sortBy, setSortBy] = useState("title");
  // У сітці клік по плитці курсу не може розтягувати САМУ плитку
  // (зламало б сітку сусідів) — розгортає єдину спільну панель під усією
  // сіткою, тому стан "яка плитка розгорнута" тут, на рівні дашборда, а
  // не локально в плитці (на відміну від CourseRow у списковому режимі).
  const [expandedCourseId, setExpandedCourseId] = useState(null);
  // Контекстне меню правого кліку по плитці папки (Перейменувати/Видалити)
  // — той самий Explorer-патерн, що просив користувач.
  const [contextMenu, setContextMenu] = useState(null); // { folderId, x, y } | null
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [deletingFolderId, setDeletingFolderId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/courses").then((r) => r.json()),
      fetch("/api/admin/positions").then((r) => r.json()),
      fetch("/api/admin/territories").then((r) => r.json()),
      fetch("/api/admin/course-folders").then((r) => r.json()),
    ])
      .then(([coursesData, positionsData, territoriesData, folderData]) => {
        if (cancelled) return;
        setCourses(coursesData);
        setPositions(positionsData);
        setTerritories(territoriesData.territories);
        setEmployees(territoriesData.employees);
        setFolders(folderData.folders || []);
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
    // Форма створення закривається, але не "в нікуди" — одразу відкриваємо
    // щойно створений курс у режимі редагування (той самий
    // CourseExpandedBody/CourseSettingsBar), щоб адмін міг одразу
    // призначити посади/території, не шукаючи курс у списку заново.
    setExpandedCourseId(createdCourse.id);
  }

  // PATCH /api/admin/courses/:id повертає курс БЕЗ modules — зберігаємо
  // наявні modules цього курсу, підмінюємо лише скалярні поля.
  function handleCourseSaved(courseId, updated) {
    setCourses((cs) => cs.map((c) => (c.id === courseId ? { ...c, ...updated, modules: c.modules } : c)));
  }

  function handleCourseDeleted(courseId) {
    setCourses((cs) => cs.filter((c) => c.id !== courseId));
  }

  // Дублікат — та сама назва (без урахування регістру) вже є серед папок
  // з тим самим parentId (як в Провіднику Windows — заборона лише в межах
  // однієї батьківської папки, не глобально по всьому каталогу).
  function findDuplicateFolder(name, parentId, excludeId) {
    const lower = name.toLowerCase();
    return folders.find((f) => f.id !== excludeId && f.parentId === parentId && f.name.toLowerCase() === lower);
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    if (findDuplicateFolder(name, currentFolderId, null)) {
      setFolderError("Папка з такою назвою вже існує тут.");
      return;
    }
    setFolderError("");
    setCreatingFolder(true);
    try {
      const res = await fetch("/api/admin/course-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: currentFolderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setFolders((fs) => [...fs, data]);
      setNewFolderName("");
      setShowCreateFolder(false);
    } catch (err) {
      setFolderError("Помилка створення папки: " + err.message);
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleRenameFolder(folderId, name) {
    const current = folders.find((f) => f.id === folderId);
    if (current && findDuplicateFolder(name, current.parentId, folderId)) {
      window.alert("Папка з такою назвою вже існує тут.");
      return;
    }
    const res = await fetch(`/api/admin/course-folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const updated = await res.json();
      setFolders((fs) => fs.map((f) => (f.id === folderId ? updated : f)));
    } else {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error || "Не вдалося перейменувати папку.");
    }
  }

  async function handleDeleteFolder(folderId) {
    setDeletingFolderId(folderId);
    try {
      const res = await fetch(`/api/admin/course-folders/${folderId}`, { method: "DELETE" });
      if (res.ok) {
        setFolders((fs) => fs.filter((f) => f.id !== folderId));
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Не вдалося видалити папку.");
      }
    } finally {
      setDeletingFolderId(null);
    }
  }

  // targetFolderId: null означає корінь каталогу — валідна ціль.
  async function handleDropOnFolder(targetFolderId) {
    const item = draggedItem;
    setDraggedItem(null);
    setDragOverFolderId(undefined);
    if (!item) return;

    if (item.type === "course") {
      const course = (courses || []).find((c) => c.id === item.id);
      if (!course || course.folderId === targetFolderId) return;
      const res = await fetch(`/api/admin/courses/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: targetFolderId }),
      });
      if (res.ok) {
        setCourses((cs) => cs.map((c) => (c.id === item.id ? { ...c, folderId: targetFolderId } : c)));
      }
      return;
    }

    if (item.type === "folder") {
      if (item.id === targetFolderId) return; // папка сама на себе
      const res = await fetch(`/api/admin/course-folders/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: targetFolderId }),
      });
      if (res.ok) {
        const updated = await res.json();
        setFolders((fs) => fs.map((f) => (f.id === item.id ? updated : f)));
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Не вдалося перемістити папку.");
      }
    }
  }

  if (loadError) return <p className="admin-page admin-error">Не вдалося завантажити курси: {loadError}</p>;

  const isSearching = Boolean(courseQuery.trim() || categoryFilter);

  // Сортування. За назвою — за зростанням (А→Я); за датою й за
  // призначеннями — за СПАДАННЯМ: там питання завжди "що найновіше" й
  // "що найпоширеніше", а не навпаки. localeCompare з "uk" — інакше
  // кирилиця сортується за кодами символів, і "Є"/"І"/"Ї" опиняються не
  // на своїх місцях.
  const byTitle = (a, b) => (a.title || a.name || "").localeCompare(b.title || b.name || "", "uk");
  const sortCourses = (list) => {
    const sorted = [...list];
    if (sortBy === "createdAt") {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === "enrollments") {
      sorted.sort((a, b) => (b._count?.enrollments ?? 0) - (a._count?.enrollments ?? 0) || byTitle(a, b));
    } else {
      sorted.sort(byTitle);
    }
    return sorted;
  };

  const visibleCourses = sortCourses(
    (courses || []).filter((c) => {
      if (categoryFilter && c.category !== categoryFilter) return false;
      if (courseQuery.trim() && !c.title.toLowerCase().includes(courseQuery.trim().toLowerCase())) return false;
      if (!isSearching && c.folderId !== currentFolderId) return false;
      return true;
    })
  );

  // Папки сортуються лише за назвою або датою — "за призначеннями" для
  // них не існує (це властивість курсу), тож у цьому режимі лишаємо
  // алфавіт, а не вигадуємо папкам неіснуючий лічильник.
  const visibleFolders = isSearching
    ? []
    : [...folders.filter((f) => f.parentId === currentFolderId)].sort((a, b) =>
        sortBy === "createdAt" ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() : byTitle(a, b)
      );

  // Хлібні крихти поточної папки — від кореня до currentFolderId.
  const breadcrumb = [];
  {
    let cursor = currentFolderId;
    const folderById = new Map(folders.map((f) => [f.id, f]));
    while (cursor != null) {
      const f = folderById.get(cursor);
      if (!f) break;
      breadcrumb.unshift(f);
      cursor = f.parentId;
    }
  }

  function folderItemCount(folderId) {
    const subCount = folders.filter((f) => f.parentId === folderId).length;
    const courseCount = (courses || []).filter((c) => c.folderId === folderId).length;
    return subCount + courseCount;
  }

  return (
    <div className="admin-page">
      <div
        className="admin-btn-group"
        style={{
          width: "100%",
          height: 42,
          alignItems: "center",
          borderTop: "1px solid var(--line)",
          borderLeft: "1px solid var(--line)",
          borderRight: "1px solid var(--line)",
          borderBottom: isSearching ? "1px solid var(--line)" : "none",
          borderRadius: "var(--radius-btn)",
          padding: "8px 10px",
          boxSizing: "border-box",
        }}
      >
        <button
          type="button"
          className="admin-btn"
          onClick={() => setShowCreate((v) => !v)}
          title={showCreate ? "Закрити форму без створення курсу" : "Відкрити форму створення нового курсу"}
        >
          {showCreate ? "Скасувати" : "+ Додати курс"}
        </button>
        {/* Створення папки переїхало сюди з іконки біля хлібних крихт:
            дві дії одного роду ("додати щось у цю папку") тепер стоять
            поруч і виглядають однаково, а не одна текстовою кнопкою, а
            друга безпідписною іконкою в іншому ряду. Підпис не
            перемикається на "Скасувати", як у курсу: там інлайн-форма
            прямо під кнопкою, а тут модальне вікно з власним "Скасувати". */}
        <button
          type="button"
          className="admin-btn"
          onClick={() => setShowCreateFolder(true)}
          title="Створити нову папку в поточній"
        >
          + Додати папку
        </button>
        {courses && courses.length > 0 && (
          <>
            <select
              className="admin-select adm-toolbar-input"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ marginLeft: "auto" }}
            >
              <option value="">Усі департаменти</option>
              {EMPLOYEE_DEPARTMENTS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <select
              className="admin-select adm-toolbar-input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              title="Порядок у каталозі"
              aria-label="Сортування"
            >
              <option value="title">За назвою</option>
              <option value="createdAt">За датою</option>
              <option value="enrollments">За призначеннями</option>
            </select>
            <input
              className="admin-input-flex adm-toolbar-input"
              placeholder="Пошук курсу"
              value={courseQuery}
              onChange={(e) => setCourseQuery(e.target.value)}
              style={{ maxWidth: 160 }}
            />
          </>
        )}
        <div className="adm-view-toggle">
          <button
            type="button"
            className={viewMode === "grid" ? "active" : ""}
            title="Плитки"
            aria-label="Плитки"
            onClick={() => setViewMode("grid")}
          >
            <GridViewIcon />
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "active" : ""}
            title="Список"
            aria-label="Список"
            onClick={() => setViewMode("list")}
          >
            <ListViewIcon />
          </button>
        </div>
      </div>

      {showCreate && (
        <CourseCreateForm
          positions={positions}
          territories={territories}
          employees={employees}
          folderId={currentFolderId}
          onCreated={handleCourseCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {showCreateFolder && (
        <div
          className="adm-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateFolder(false);
          }}
          onKeyDown={(e) => e.key === "Escape" && setShowCreateFolder(false)}
        >
          <div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="newFolderModalTitle">
            <h2 id="newFolderModalTitle" className="adm-modal-title">
              Нова папка
            </h2>
            <input
              className="admin-input-flex"
              placeholder="Назва папки…"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newFolderName.trim() && !creatingFolder && handleCreateFolder()}
              disabled={creatingFolder}
              autoFocus
            />
            {folderError && <p className="admin-error">{folderError}</p>}
            <div className="admin-btn-group" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button type="button" className="admin-btn" disabled={!newFolderName.trim() || creatingFolder} onClick={handleCreateFolder}>
                {creatingFolder ? <SpinnerIcon /> : "Створити"}
              </button>
              <button type="button" className="admin-btn-danger" disabled={creatingFolder} onClick={() => setShowCreateFolder(false)}>
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Смуга навігації по каталогу. Стилі переїхали з інлайнового
          style= в клас .adm-breadcrumb-bar (app/styles/admin.css) — там
          з'явився власний фон, щоб вона читалась як окремий рівень, а не
          зливалась із тулбаром зверху й списком знизу. */}
      {!isSearching && (
        <div className="adm-breadcrumb-bar">
          {/* Підйом на рівень вище. У корені підійматись нікуди — тоді це
              не кнопка, а статичний значок кореня: так видно, ДЕ ти, а не
              лише куди можна піти (той самий прийом, що й неактивна
              коренева крихта поруч). Кнопка веде до батьківської папки
              поточної, а не просто "на крок назад" по історії — в
              каталозі важлива ієрархія, а не порядок кліків. */}
          {currentFolderId === null ? (
            <span className="adm-breadcrumb-nav is-root" title="Корінь каталогу" aria-hidden="true">
              <RootIcon />
            </span>
          ) : (
            <button
              type="button"
              className="iconbtn adm-breadcrumb-nav"
              title="На рівень вище"
              aria-label="На рівень вище"
              onClick={() => {
                const current = folders.find((f) => f.id === currentFolderId);
                setCurrentFolderId(current ? current.parentId : null);
              }}
            >
              <ArrowBackIcon />
            </button>
          )}
          <nav className="adm-breadcrumb">
            <button
              type="button"
              className={`adm-breadcrumb-crumb${dragOverFolderId === null ? " admin-drag-over" : ""}${currentFolderId === null ? " current" : ""}`}
            onClick={() => setCurrentFolderId(null)}
            onDragOver={(e) => {
              if (draggedItem) {
                e.preventDefault();
                setDragOverFolderId(null);
              }
            }}
            onDragLeave={() => setDragOverFolderId((v) => (v === null ? undefined : v))}
            onDrop={() => handleDropOnFolder(null)}
          >
            <FolderIcon /> /
          </button>
          {breadcrumb.map((f, i) => (
            <span key={f.id} className="adm-breadcrumb-item">
              {/* Перший роздільник після кореня не рендеримо — коренева
                  крихта сама вже закінчується на "/" (FolderIcon + "/"
                  вище), інакше вийде подвійний "//". */}
              {i > 0 && <span className="adm-breadcrumb-sep">/</span>}
              <button
                type="button"
                className={`adm-breadcrumb-crumb${dragOverFolderId === f.id ? " admin-drag-over" : ""}${i === breadcrumb.length - 1 ? " current" : ""}`}
                onClick={() => setCurrentFolderId(f.id)}
                onDragOver={(e) => {
                  if (draggedItem && draggedItem.id !== f.id) {
                    e.preventDefault();
                    setDragOverFolderId(f.id);
                  }
                }}
                onDragLeave={() => setDragOverFolderId((v) => (v === f.id ? undefined : v))}
                onDrop={() => handleDropOnFolder(f.id)}
              >
                {f.name}
              </button>
            </span>
          ))}
          </nav>
        </div>
      )}

      {isSearching && <p className="admin-hint" style={{ marginBottom: 8 }}>Пошук по всьому каталогу, не лише поточній папці.</p>}

      {!courses ? (
        <p>
          <SpinnerIcon />
          Завантаження…
        </p>
      ) : courses.length === 0 ? (
        <p>Курсів ще немає.</p>
      ) : visibleCourses.length === 0 && visibleFolders.length === 0 ? (
        <p className="admin-hint" style={{ marginTop: 10 }}>{isSearching ? "Нічого не знайдено за цим фільтром." : "Тут поки порожньо."}</p>
      ) : viewMode === "grid" ? (
        <>
          <div className="adm-explorer-grid">
            {visibleFolders.map((folder) => (
              <FolderTile
                key={`f${folder.id}`}
                folder={folder}
                itemCount={folderItemCount(folder.id)}
                isDragOver={dragOverFolderId === folder.id}
                isRenaming={renamingFolderId === folder.id}
                isDeleting={deletingFolderId === folder.id}
                onOpen={() => setCurrentFolderId(folder.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ folderId: folder.id, x: e.clientX, y: e.clientY });
                }}
                onRenameSubmit={(name) => {
                  handleRenameFolder(folder.id, name);
                  setRenamingFolderId(null);
                }}
                onRenameCancel={() => setRenamingFolderId(null)}
                onDragStart={() => setDraggedItem({ type: "folder", id: folder.id })}
                onDragEnd={() => {
                  setDraggedItem(null);
                  setDragOverFolderId(undefined);
                }}
                onDragOverFolder={() => {
                  if (draggedItem && !(draggedItem.type === "folder" && draggedItem.id === folder.id)) {
                    setDragOverFolderId(folder.id);
                  }
                }}
                onDragLeaveFolder={() => setDragOverFolderId((v) => (v === folder.id ? undefined : v))}
                onDropOnFolder={() => handleDropOnFolder(folder.id)}
              />
            ))}
            {visibleCourses.map((course) => (
              <CourseTile
                key={`c${course.id}`}
                course={course}
                selected={expandedCourseId === course.id}
                onClick={() => setExpandedCourseId((id) => (id === course.id ? null : course.id))}
                onDragStart={() => setDraggedItem({ type: "course", id: course.id })}
                onDragEnd={() => {
                  setDraggedItem(null);
                  setDragOverFolderId(undefined);
                }}
              />
            ))}
          </div>

          {contextMenu && (
            <FolderContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              onClose={() => setContextMenu(null)}
              onRename={() => {
                setRenamingFolderId(contextMenu.folderId);
                setContextMenu(null);
              }}
              onDelete={() => {
                handleDeleteFolder(contextMenu.folderId);
                setContextMenu(null);
              }}
            />
          )}

          {expandedCourseId &&
            (() => {
              const course = visibleCourses.find((c) => c.id === expandedCourseId);
              if (!course) return null;
              return (
                <div className="adm-explorer-detail">
                  <div className="admin-hint" style={{ marginBottom: 5, fontSize: "0.95em" }}>
                    /{course.slug} · {course.modules.length} {course.modules.length === 1 ? "модуль" : "модулів"} ·
                    Призначено: {course._count?.enrollments ?? 0}
                  </div>
                  <CourseExpandedBody
                    course={course}
                    positions={positions}
                    territories={territories}
                    employees={employees}
                    onModuleAdded={handleModuleAdded}
                    onModulesReordered={handleModulesReordered}
                    onCourseSaved={handleCourseSaved}
                    onCourseDeleted={(id) => {
                      handleCourseDeleted(id);
                      setExpandedCourseId(null);
                    }}
                  />
                </div>
              );
            })()}
        </>
      ) : (
        <>
          {visibleFolders.length > 0 && (
            <ul className="admin-course-list" style={{ marginBottom: visibleCourses.length > 0 ? 8 : 0 }}>
              {visibleFolders.map((folder) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  itemCount={folderItemCount(folder.id)}
                  isDragOver={dragOverFolderId === folder.id}
                  isDeleting={deletingFolderId === folder.id}
                  onOpen={() => setCurrentFolderId(folder.id)}
                  onRename={(name) => handleRenameFolder(folder.id, name)}
                  onDelete={() => handleDeleteFolder(folder.id)}
                  onDragStart={() => setDraggedItem({ type: "folder", id: folder.id })}
                  onDragEnd={() => {
                    setDraggedItem(null);
                    setDragOverFolderId(undefined);
                  }}
                  onDragOverFolder={() => {
                    if (draggedItem && !(draggedItem.type === "folder" && draggedItem.id === folder.id)) {
                      setDragOverFolderId(folder.id);
                    }
                  }}
                  onDragLeaveFolder={() => setDragOverFolderId((v) => (v === folder.id ? undefined : v))}
                  onDropOnFolder={() => handleDropOnFolder(folder.id)}
                />
              ))}
            </ul>
          )}

          {visibleCourses.length > 0 && (
            <ul className="admin-course-list">
              {visibleCourses.map((course) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  positions={positions}
                  territories={territories}
                  employees={employees}
                  initialExpanded={course.id === expandedCourseId}
                  onModuleAdded={handleModuleAdded}
                  onModulesReordered={handleModulesReordered}
                  onCourseSaved={handleCourseSaved}
                  onCourseDeleted={handleCourseDeleted}
                  onDragStart={() => setDraggedItem({ type: "course", id: course.id })}
                  onDragEnd={() => {
                    setDraggedItem(null);
                    setDragOverFolderId(undefined);
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Плитка папки в сітковому виді — велика іконка + назва під нею, як у
 * Провіднику Windows. Перетягується (переміщення в іншу папку) і сама є
 * ціллю drop (прийом курсу/іншої папки). Дії (перейменувати/видалити) —
 * НЕ видимі кнопки, а контекстне меню по правому кліку (FolderContextMenu
 * нижче) — за проханням користувача, максимально по-Explorer'івськи. */
function FolderTile({
  folder,
  itemCount,
  isDragOver,
  isRenaming,
  isDeleting,
  onOpen,
  onContextMenu,
  onRenameSubmit,
  onRenameCancel,
  onDragStart,
  onDragEnd,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
}) {
  const [name, setName] = useState(folder.name);

  return (
    <div
      className={`adm-tile${isDragOver ? " drag-over" : ""}`}
      draggable={!isRenaming && !isDeleting}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverFolder();
      }}
      onDragLeave={onDragLeaveFolder}
      onDrop={(e) => {
        e.preventDefault();
        onDropOnFolder();
      }}
      onContextMenu={isDeleting ? undefined : onContextMenu}
    >
      {/* Під час перейменування іконка й поле вводу — окремі елементи
          (кнопка не має проковтувати кліки в інпут); у звичайному стані
          іконка, назва й лічильник лежать в ОДНІЙ кнопці на всю плитку,
          щоб клікабельним був увесь бокс, а не сама лише іконка — так
          само, як у плитці курсу. */}
      {isRenaming ? (
        <>
          <span className="adm-tile-icon adm-tile-icon-folder" style={{ color: folderTileColor(folder.id) }}>
            <FolderIcon />
          </span>
          <input
            className="adm-tile-rename-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) onRenameSubmit(name.trim());
              if (e.key === "Escape") onRenameCancel();
            }}
            onBlur={() => (name.trim() && name.trim() !== folder.name ? onRenameSubmit(name.trim()) : onRenameCancel())}
            autoFocus
          />
        </>
      ) : (
        <button
          type="button"
          className="adm-tile-hit-full"
          onClick={() => !isDeleting && onOpen()}
          disabled={isDeleting}
          title={`${folder.name} — ${itemCount === 0 ? "порожньо" : pluralize(itemCount, "елемент", "елементи", "елементів")}`}
        >
          <span className="adm-tile-icon adm-tile-icon-folder" style={isDeleting ? undefined : { color: folderTileColor(folder.id) }}>
            {isDeleting ? <SpinnerIcon /> : <FolderIcon />}
          </span>
          <span className="adm-tile-label">{folder.name}</span>
          {/* Лічильник вмісту був лише в title-тултипі — на плитці його
              не було видно без ховера, а сусідня плитка курсу свій
              підпис показує. Заразом вирівнює висоти в сітці. */}
          <span className="adm-tile-sub">
            {itemCount === 0 ? "порожньо" : pluralize(itemCount, "елемент", "елементи", "елементів")}
          </span>
        </button>
      )}
    </div>
  );
}

/** Плитка курсу в сітковому виді — клік перемикає розгорнуту панель під
 * сіткою (AdminDashboard), не саму плитку (щоб не ламати сітку сусідів). */
function CourseTile({ course, selected, onClick, onDragStart, onDragEnd }) {
  return (
    <div
      className={`adm-tile${selected ? " selected" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <button type="button" className="adm-tile-hit-full" onClick={onClick} title={course.title}>
        <span className="adm-tile-icon adm-tile-icon-course">
          <CourseIcon />
        </span>
        <span className="adm-tile-label">{course.title}</span>
        <span className="adm-tile-sub">{course._count?.enrollments ?? 0} призначено</span>
      </button>
    </div>
  );
}

/** Контекстне меню правого кліку по плитці папки — Провідник-патерн:
 * фіксоване позиціювання за курсором + невидимий backdrop на весь екран,
 * що закриває меню кліком повз нього (найлегший спосіб без порталу чи
 * постійного document-листенера). */
function FolderContextMenu({ x, y, onRename, onDelete, onClose }) {
  return (
    <>
      <div className="adm-context-backdrop" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div className="adm-context-menu" style={{ left: x, top: y }}>
        <button type="button" onClick={onRename}>
          Перейменувати
        </button>
        <button type="button" onClick={onDelete}>
          Видалити
        </button>
      </div>
    </>
  );
}

function FolderRow({
  folder,
  itemCount,
  isDragOver,
  isDeleting,
  onOpen,
  onRename,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);

  function handleSaveRename() {
    if (name.trim() && name.trim() !== folder.name) onRename(name.trim());
    setRenaming(false);
  }

  return (
    <li
      className={`admin-course-row${isDragOver ? " admin-drag-over" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverFolder();
      }}
      onDragLeave={onDragLeaveFolder}
      onDrop={(e) => {
        e.preventDefault();
        onDropOnFolder();
      }}
    >
      {renaming ? (
        <div className="admin-course-list-link" style={{ gap: 8 }}>
          <span className="admin-drag-handle">
            <FolderIcon />
          </span>
          <input
            className="admin-input-flex"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveRename()}
            autoFocus
            style={{ flex: 1 }}
          />
          <button type="button" className="admin-btn-link" onClick={handleSaveRename}>
            Зберегти
          </button>
        </div>
      ) : (
        // Один <button> на весь рядок (як у CourseRow) робив би
        // "Перейменувати"/"Видалити" вкладеними інтерактивними елементами
        // всередині <button> — невалідний HTML і непередбачувана
        // поведінка кліків/фокусу. Тому тут рядок — <div> з ТРЬОМА
        // окремими кнопками-сусідами: відкрити (займає весь простір, що
        // лишився) + перейменувати + видалити.
        <div className="admin-course-list-link" style={{ padding: 0 }}>
          <button
            type="button"
            className="admin-course-row-toggle"
            onClick={onOpen}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", border: "none", background: "none", textAlign: "left" }}
          >
            <span>
              <span className="admin-drag-handle" title="Перетягніть у іншу папку">
                <FolderIcon />
              </span>{" "}
              {folder.name}
            </span>
            <span className="admin-hint">
              {itemCount === 0 ? "порожньо" : `${itemCount} ${itemCount === 1 ? "елемент" : "елементів"}`}
            </span>
          </button>
          <button
            type="button"
            className="admin-icon-btn adm-row-icon-btn"
            style={{ color: "var(--ink-soft)" }}
            title="Перейменувати"
            aria-label="Перейменувати"
            onClick={() => setRenaming(true)}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="admin-icon-btn adm-row-icon-btn"
            style={{ marginRight: 14 }}
            title="Видалити"
            aria-label="Видалити"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <SpinnerIcon /> : <XIcon />}
          </button>
        </div>
      )}
    </li>
  );
}
