"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { enqueue } from "@/lib/offlineOutbox";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { renderRichText } from "@/lib/richText";
import { ChevronIcon, CheckIcon, XIcon, CertificateIcon, SpinnerIcon, QuestionIcon } from "@/components/icons";
import { CoursePlanPanel } from "@/components/CoursePlan";
import { OrderingScreen, MatchingScreen } from "@/components/QuestionScreens";
import {
  AccordionScreen,
  ChecklistScreen,
  ScriptScreen,
  TimelineScreen,
  PhotoScreen,
  InputScreen,
  ImageLightbox,
  ScreenMedia,
  CourseImage,
  ConfettiBurst,
  HotspotScreen,
  StreakToast,
} from "@/components/ScreenComponents";
import { isGateSatisfied, gateTotal, gateHint, isScored } from "@/lib/componentTypes";
import { courseStreakMessages, pickStreakMessage, resolveStreakSub, isScheduledStreak } from "@/lib/streakMessages";
import { numberComponents, shuffleArray } from "@/lib/coursePlayerLogic";
import { peekScrollTo } from "@/lib/scrollHints";
import { downloadCertificate } from "@/lib/downloadCertificate";
import { getLocalDisplayName } from "@/lib/localName";

// Плеєр курсу. Крім info/quiz підтримує інтерактивні компоненти, портовані
// з попередньої vanilla-JS розробки "8 кроків телесейлінгу": accordion,
// checklist, script (діалог дзвінка), timeline, а також прості photo/input.
// У кожного свій "гейт" — «Далі» лишається заблокованою, поки співробітник
// реально не провзаємодіє з УСІМА компонентами екрана (правила —
// lib/componentTypes.js). Один Screen може тримати кілька Component,
// розставлених у порядку, — плеєр рендерить їх усі стеком на одному кроці
// (goNext/goBack ходять по ЕКРАНАХ, не по окремих компонентах).
// Streak-конфеті й desktop outline із того прототипу поки не переносили.

const STORAGE_PREFIX = "course_progress_";

function loadProgress(slug) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + slug);
    if (raw) return JSON.parse(raw);
  } catch {
    // localStorage недоступний — просто починаємо спочатку
  }
  return null;
}

function saveProgress(slug, idx, answers) {
  try {
    localStorage.setItem(STORAGE_PREFIX + slug, JSON.stringify({ idx, answers }));
  } catch {
    // ігноруємо — прогрес просто не відновиться після перезавантаження
  }
}

function clearProgress(slug) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + slug);
  } catch {
    // ігноруємо
  }
}

/**
 * Диспетчер КОМПОНЕНТІВ (не екранів — один екран тепер може мати кілька):
 * за Component.type віддає потрібний фрагмент розмітки, БЕЗ власної
 * обгортки .cp-screen — весь стек компонентів одного екрана огортає
 * ОДНИМ .cp-screen батько (ScreenBody нижче). Той самий диспетчер і в
 * плеєрі, і в прев'ю /admin — щоб адміністратор бачив рівно те, що
 * побачить співробітник.
 */
export function ComponentScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }) {
  // onZoomImage тепер потрібен КОЖНОМУ типу, а не лише photo/info: фото
  // можна додати до будь-якого компонента, і збільшувати його по кліку
  // має скрізь однаково.
  // readOnly — «методичка» (components/CourseReview.jsx): усе розкрито
  // одразу, без гейтів, тапів і підсвітки наступного кроку — це довідник
  // для підглядання, а не повторне проходження.
  // tapHint — чи показувати перелив «тапни сюди» на наступній цілі; плеєр
  // вмикає його лише для першого непройденого гейта екрана.
  const common = { component, screenNumber, onGateProgress, onZoomImage, readOnly, tapHint };
  switch (component.type) {
    case "accordion":
      return <AccordionScreen {...common} />;
    case "checklist":
      return <ChecklistScreen {...common} />;
    case "script":
      return <ScriptScreen {...common} />;
    case "timeline":
      return <TimelineScreen {...common} />;
    case "photo":
      return <PhotoScreen component={component} screenNumber={screenNumber} onZoomImage={onZoomImage} />;
    case "input":
      return <InputScreen {...common} />;
    default:
      return <InfoScreen component={component} screenNumber={screenNumber} onZoomImage={onZoomImage} />;
  }
}

// Експортуються також для живого прев'ю в /admin (components/AdminCourseEditor.jsx) —
// той самий рендер, що бачить співробітник у плеєрі, не окрема копія розмітки.
export function InfoScreen({ component, screenNumber, onZoomImage }) {
  const { kicker, lead, body, images, note } = component.content || {};
  // Без картинок з URL — не пустий масив, а взагалі відсутність .cp-info-media
  // в DOM (щоб CSS-селектор :has(+ .cp-info-text) у @container-reflow,
  // course-player.css, коректно бачив "нема сусіда зліва" і не ділив
  // порожню колонку навпіл).
  const validImages = images?.filter((img) => img.url) || []; // без фільтра
  // next/image кидає варнінг на порожній src — трапляється, коли в /admin
  // додали слот під фото, але ще не встигли завантажити файл/вписати URL.
  const hasMedia = validImages.length > 0;
  const zoomable = typeof onZoomImage === "function";

  const mediaNode = hasMedia && (
    <div className="cp-info-media">
      {validImages.map((img, i) => {
        const alt = img.caption || component.title || "";
        // Фото клікабельне лише там, де плеєр дав куди його відкрити
        // (onZoomImage) — у статичних контекстах лишається звичайним.
        return (
          <div
            className={`photo-frame${zoomable ? " zoomable" : ""}`}
            key={i}
            role={zoomable ? "button" : undefined}
            tabIndex={zoomable ? 0 : undefined}
            onClick={zoomable ? () => onZoomImage({ src: img.url, alt }) : undefined}
            onKeyDown={
              zoomable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onZoomImage({ src: img.url, alt });
                    }
                  }
                : undefined
            }
          >
            <CourseImage src={img.url} alt={alt} zoomable={zoomable} />
            {img.caption && <div className="cp-photo-caption">{img.caption}</div>}
          </div>
        );
      })}
    </div>
  );

  const textNode = (body || note) && (
    <div className="cp-info-text">
      {body && <div className="cp-body">{renderRichText(body)}</div>}
      {note && <NoteAccordion note={note} />}
    </div>
  );

  return (
    <>
      {kicker && (
        <div className="cp-kicker">
          <span className="cp-kicker-num">{screenNumber}</span>
          <span>{kicker}</span>
        </div>
      )}
      {component.title && <h2 className="cp-h2">{component.title}</h2>}
      {lead && <p className="cp-lead">{lead}</p>}
      {mediaNode}
      {textNode}
    </>
  );
}

/** "Підказка" (Component.content.info.note) — розгортається по кліку, а не
 * видима завжди: щоб не перевантажувати екран текстом одразу і трохи
 * заохотити самому подумати перед тим, як підглянути відповідь/деталь. */
function NoteAccordion({ note }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  function toggle() {
    const opening = !open;
    setOpen(opening);
    // Той самий патерн, що в акордеоні/таймлайні: розкрили — розкритий
    // текст має лишитись на екрані, а не піти під нижній край
    // (користувач, 2026-09-15: «Варто знати не скролить по паттерну»).
    if (opening) requestAnimationFrame(() => peekScrollTo(null, { keepVisible: boxRef.current }));
  }
  return (
    <div className={`cp-note-accordion${open ? " open" : ""}`} ref={boxRef}>
      <button type="button" className="cp-note-toggle" onClick={toggle} aria-expanded={open}>
        <b>Варто знати</b>
        <span className="cp-note-chevron">
          <ChevronIcon />
        </span>
      </button>
      {open && <div className="cp-note-body">{note}</div>}
    </div>
  );
}

export function QuizScreen({ component, screenNumber, answer, onAnswer, onZoomImage, questionNumber, questionTotal }) {
  const { questionType, options: rawOptions, shuffleOptions, explanation } = component.content;
  // Перемішуємо ОДИН раз при монтуванні: інакше варіанти стрибали б на
  // кожен ререндер (а він тут є — вибір у multi). Порядок живий лише поки
  // екран відкритий; повернувшись пізніше, людина побачить новий — так
  // само поводився legacy-курс.
  const [options] = useState(() => (shuffleOptions === false ? rawOptions : shuffleArray(rawOptions)));
  const [selected, setSelected] = useState([]);
  const isAnswered = answer !== undefined;

  function handleSingleClick(index) {
    if (isAnswered) return;
    const isCorrect = options[index].correct;
    onAnswer(isCorrect);
    setSelected([index]);
  }

  function toggleMulti(index) {
    if (isAnswered) return;
    setSelected((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
  }

  function submitMulti() {
    if (isAnswered) return;
    const allCorrect = options.every((opt, i) => opt.correct === selected.includes(i));
    onAnswer(allCorrect);
  }

  /**
   * Які пояснення показати після відповіді. Не всі підряд: обраний
   * невірний варіант («чому це не так») і пропущений правильний («що
   * треба було обрати»). Правильний обраний варіант теж пояснюємо — його
   * могли вгадати.
   */
  const optionFeedback = isAnswered
    ? options
        .map((opt, index) => {
          if (!opt.explanation) return null;
          const chosen = selected.includes(index);
          if (chosen && !opt.correct) return { index, kind: "is-wrong", text: opt.text, explanation: opt.explanation };
          if (opt.correct) return { index, kind: "is-correct", text: opt.text, explanation: opt.explanation };
          return null;
        })
        .filter(Boolean)
    : [];

  function optionClass(opt, index) {
    const classes = ["opt"];
    if (isAnswered) {
      classes.push("disabled");
      if (opt.correct) classes.push("correct");
      else if (selected.includes(index)) classes.push("wrong");
    } else if (selected.includes(index)) {
      classes.push("selected");
    }
    return classes.join(" ");
  }

  return (
    <>
      <div className="cp-kicker">
        <span className="cp-kicker-num">{screenNumber}</span>
        <span>Питання</span>
      </div>
      {/* Банер блоку питань — як у legacy (course-assortment.html
          .quiz-banner): золота плашка з пульсуючою іконкою і бліком, щоб
          тест візуально відрізнявся від матеріалу і читався як «зараз
          перевірка». Лічильник — наскрізний по оцінюваних компонентах
          курсу; у прев'ю конструктора його нема — лише заголовок. */}
      <div className="quiz-banner">
        <span className="quiz-banner-ico" aria-hidden="true">
          <QuestionIcon />
        </span>
        <span className="quiz-banner-txt">
          <b>Блок питань</b>
          {questionNumber && questionTotal ? (
            <span>
              Питання {questionNumber} з {questionTotal}
            </span>
          ) : (
            <span>Оберіть відповідь</span>
          )}
        </span>
      </div>
      <span className="q-type-tag">{questionType === "multi" ? "Кілька правильних" : "Один варіант"}</span>
      <h2 className="cp-h2">{component.title}</h2>
      {/* Фото між питанням і варіантами — питання може спиратись саме на
          зображення ("що не так на цій викладці?"). */}
      <ScreenMedia images={component.content?.images} title={component.title} onZoomImage={onZoomImage} />

      <div className="opt-group">
        {options.map((opt, index) => (
          <button
            key={index}
            type="button"
            className={optionClass(opt, index)}
            onClick={() => (questionType === "multi" ? toggleMulti(index) : handleSingleClick(index))}
          >
            {/* Маркер вибору — кружечок для одного варіанта, квадратик із
                галочкою для кількох. Повернуто з legacy-курсу: без нього
                по варіанту не видно, що він взагалі вибирається, поки не
                натиснеш. */}
            <span className={`opt-mark${questionType === "multi" ? " chk" : ""}`} aria-hidden="true" />
            <span className="opt-text">{opt.text}</span>
          </button>
        ))}
      </div>

      {questionType === "multi" && !isAnswered && (
        <button type="button" className="btn-primary-full" onClick={submitMulti} disabled={selected.length === 0}>
          <span className="btn-label">Перевірити</span>
        </button>
      )}

      {isAnswered && (
        <div className={`q-fb show ${answer ? "ok" : "bad"}`}>
          <b className="q-fb-verdict">
            {answer
              ? questionType === "multi"
                ? "Правильно! Усі варіанти обрано вірно."
                : "Правильно!"
              : questionType === "multi"
                ? "Правильні варіанти виділені зеленим."
                : "Правильна відповідь виділена зеленим."}
          </b>
          {/* Пояснення автора — показуємо і при правильній відповіді:
              вгадати можна й не зрозумівши, а сенс питання саме в тому,
              щоб людина дізналась ЧОМУ. */}
          {/* Розбір ПО ВАРІАНТАХ, а не лише один на питання: людині треба
              знати, чому невірне — невірне, і що вона проґавила. Саме
              якість зворотного зв'язку впливає на запам'ятовування
              сильніше за формат питання (рішення користувача, 2026-09-17). */}
          {optionFeedback.length > 0 && (
            <ul className="q-fb-options">
              {optionFeedback.map((o) => (
                <li key={o.index} className={o.kind}>
                  <b>{o.text}</b>
                  <span>{o.explanation}</span>
                </li>
              ))}
            </ul>
          )}
          {explanation && <span className="q-fb-explain">{explanation}</span>}
        </div>
      )}
    </>
  );
}

/**
 * Один компонент у стеку екрана — маршрутизує quiz окремо (потребує
 * answer/onAnswer, не onGateProgress) від решти типів, і огортає кожен у
 * .screen-component (візуальний роздільник між сусідніми компонентами
 * одного екрана — див. course-player.css).
 */
function ScreenComponentBlock({
  component,
  screenNumber,
  answers,
  onQuizAnswer,
  gateProgress,
  onGateProgress,
  onZoomImage,
  blockRef,
  nextComponentId,
  tapHint = true,
  questionNumber,
  questionTotal,
}) {
  return (
    <div className="screen-component" ref={blockRef} data-next-component={nextComponentId ?? undefined}>
      {component.type === "ordering" ? (
        <OrderingScreen
          component={component}
          screenNumber={screenNumber}
          answer={answers[component.id]}
          onAnswer={(isCorrect) => onQuizAnswer(component.id, isCorrect)}
          onZoomImage={onZoomImage}
          questionNumber={questionNumber}
          questionTotal={questionTotal}
        />
      ) : component.type === "matching" ? (
        <MatchingScreen
          component={component}
          screenNumber={screenNumber}
          answer={answers[component.id]}
          onAnswer={(isCorrect) => onQuizAnswer(component.id, isCorrect)}
          onZoomImage={onZoomImage}
          questionNumber={questionNumber}
          questionTotal={questionTotal}
        />
      ) : component.type === "hotspot" ? (
        <HotspotScreen
          component={component}
          screenNumber={screenNumber}
          answer={answers[component.id]}
          onAnswer={(isCorrect) => onQuizAnswer(component.id, isCorrect)}
        />
      ) : component.type === "quiz" ? (
        <QuizScreen
          component={component}
          screenNumber={screenNumber}
          answer={answers[component.id]}
          onAnswer={(isCorrect) => onQuizAnswer(component.id, isCorrect)}
          onZoomImage={onZoomImage}
          questionNumber={questionNumber}
          questionTotal={questionTotal}
        />
      ) : (
        <ComponentScreen
          component={component}
          screenNumber={screenNumber}
          gateDone={gateProgress[component.id]}
          onGateProgress={(done) => onGateProgress(component.id, done)}
          onZoomImage={onZoomImage}
          tapHint={tapHint}
        />
      )}
    </div>
  );
}

/**
 * Проміжний екран між модулями ("Пауза між модулями" — Module.cooldownDays):
 * показується замість звичайного екрана одразу після останнього питання
 * модуля. При провалі (не склав тести модуля) пропонує перепройти саме цей
 * модуль, не весь курс — не плутати з CompleteScreen (той для всього курсу).
 */
function ModuleCheckpointScreen({ checkpoint, onContinue, onRetry }) {
  const { moduleTitle, scorePercent, scoreRaw, scoreMax, passed, saving, saveError, note, sessionEnd, retry } = checkpoint;
  // «М'яке гальмо» перескладання: перші спроби підряд вільні, далі коротка
  // пауза. Поки результат зберігається, кнопку не міняємо — інакше вона
  // блимала б із «спробувати» на «зачекайте» і назад.
  const retryBlocked = !passed && !saving && retry && retry.canRetryNow === false;
  const attemptsLeft = !passed && retry && typeof retry.attemptsLeft === "number" ? retry.attemptsLeft : null;

  return (
    <div className="cp-screen cp-complete">
      {/* Складений модуль — теж свято, як і фінал курсу (користувач, 2026-09-15). */}
      {passed && <ConfettiBurst />}
      <div className={`trophy ${passed ? "win" : ""}`}>{passed ? <CheckIcon /> : <XIcon />}</div>
      <h2 className="result-title">{passed ? `Модуль «${moduleTitle}» складено!` : `Модуль «${moduleTitle}» не складено`}</h2>
      <p className="lead">
        {passed
          ? sessionEnd
            ? "Результат збережено. Наступний модуль відкриється після паузи — ми нагадаємо."
            : "Можна переходити до наступного модуля."
          : "Перегляньте матеріал модуля ще раз і спробуйте пройти тести знову."}
      </p>
      {passed && note && <p className="cp-note">{note}</p>}
      {scoreMax > 0 && (
        <div className="score-num">
          <b>
            {scoreRaw}/{scoreMax}
          </b>
          <span> правильних ({scorePercent}%)</span>
        </div>
      )}

      {saving && (
        <p className="cp-save-status">
          <SpinnerIcon />
          Зберігаємо результат…
        </p>
      )}
      {saveError && <p className="cp-save-status cp-save-error">Не вдалося зберегти результат: {saveError}</p>}

      {retryBlocked && (
        <p className="cp-note">
          Вільні спроби вичерпано. Наступна — через {retry.waitLabel}. Перегляньте матеріал модуля ще раз:
          пауза саме для того, щоб повернутись до нього, а не перебирати варіанти.
        </p>
      )}
      {!passed && !retryBlocked && attemptsLeft != null && attemptsLeft > 0 && (
        <p className="cp-note">Спроб підряд без паузи лишилось: {attemptsLeft}.</p>
      )}

      <button
        type="button"
        className="btn-primary-full"
        onClick={passed ? onContinue : retryBlocked ? onContinue : onRetry}
      >
        <span className="btn-label">
          {passed ? (sessionEnd ? "На головну" : "Продовжити") : retryBlocked ? "На головну" : "Спробувати модуль ще раз"}
        </span>
      </button>
    </div>
  );
}

function CompleteScreen({ result, onRetake, course, hasEmail, previewMode }) {
  // Ім'я для сертифіката: у співробітників без email Employee.name —
  // заглушка з посади, справжнє ім'я живе лише в localStorage пристрою
  // (див. lib/localName.js). Той самий підхід, що і в картці курсу.
  const [certName, setCertName] = useState("");
  const [certDownloading, setCertDownloading] = useState(false);
  const [certError, setCertError] = useState("");

  useEffect(() => {
    if (hasEmail) return;
    const local = getLocalDisplayName();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (local) setCertName(local);
  }, [hasEmail]);

  async function handleDownloadCertificate() {
    // У прев'ю справжній PDF не генеруємо: у автора немає Enrollment на
    // цей курс, і роут відповів би 403 з незрозумілою помилкою.
    if (previewMode) {
      setCertError("Це прев'ю. Справжній сертифікат співробітник завантажить після реального проходження.");
      return;
    }
    setCertDownloading(true);
    setCertError("");
    try {
      await downloadCertificate(course.slug, certName);
    } catch (err) {
      setCertError(err.message || "Не вдалося завантажити сертифікат.");
    } finally {
      setCertDownloading(false);
    }
  }

  if (!result) return null;
  const { scorePercent, scoreRaw, scoreMax, passed, submitting, submitError, queued } = result;

  // Сертифікат — лише за РІВНО 100% і лише якщо він увімкнений для цього
  // курсу (Course.certificateEnabled). Прохідний бал тут ні до чого: він
  // дає "залік", сертифікат — свідомо вища планка.
  const certificateAllowed = course?.certificateEnabled !== false;
  const isPerfect = scorePercent === 100;
  const showCertificate = isPerfect && certificateAllowed;
  // Кнопку тримаємо неактивною, поки результат не долетів до сервера:
  // роут сертифіката перевіряє саме збережений Enrollment і до того
  // моменту відповів би 403.
  const certificateReady = !submitting && !submitError && !queued;

  return (
    <div className="cp-screen cp-complete">
      {/* Свято лише за бездоганне проходження — тоді воно щось означає. */}
      {isPerfect && <ConfettiBurst />}
      <div className={`trophy ${passed ? "win" : ""}`}>
        {passed ? <CheckIcon /> : <XIcon />}
      </div>
      <h2 className="result-title">
        {isPerfect ? "Бездоганно! Курс пройдено на 100% 🎉" : passed ? "Вітаємо! Тест складено успішно 🎉" : "Тест поки не пройдено"}
      </h2>
      <p className="lead">
        {isPerfect
          ? "Жодної помилки — ви знаєте цей матеріал досконало."
          : passed
            ? "Ви впевнено знаєте цей матеріал."
            : "Перегляньте розділи ще раз і спробуйте пройти тест знову."}
      </p>
      <div className="score-num">
        <b>
          {scoreRaw}/{scoreMax}
        </b>
        <span> правильних ({scorePercent}%)</span>
      </div>

      {submitting && (
        <p className="cp-save-status">
          <SpinnerIcon />
          Зберігаємо результат…
        </p>
      )}
      {submitError && <p className="cp-save-status cp-save-error">Не вдалося зберегти результат: {submitError}</p>}
      {queued && (
        <p className="cp-save-status cp-save-queued">
          Немає мережі — результат збережено на пристрої й відправиться автоматично, щойно з&apos;явиться зв&apos;язок.
        </p>
      )}
      {!submitting && !submitError && !queued && (
        <p className="cp-save-status">{previewMode ? "Прев'ю — результат не збережено." : "Результат збережено."}</p>
      )}

      {showCertificate && (
        <div className="cp-cert-block">
          <span className="cp-cert-icon" aria-hidden="true">
            <CertificateIcon />
          </span>
          <b className="cp-cert-title">Вам видано сертифікат про проходження курсу</b>
          <span className="cp-cert-sub">
            PDF із вашим ім&apos;ям, назвою курсу «{course.title}» та датою завершення.
          </span>
          <button
            type="button"
            className="btn-primary-full cp-cert-btn"
            onClick={handleDownloadCertificate}
            disabled={certDownloading || !certificateReady}
            title={certificateReady ? "Завантажити PDF-сертифікат" : "Зачекайте, поки результат збережеться"}
          >
            {certDownloading ? <SpinnerIcon /> : <CertificateIcon />}
            <span className="btn-label">{certDownloading ? "Готуємо сертифікат…" : "Завантажити сертифікат"}</span>
          </button>
          {certError && <p className="cp-save-status cp-save-error">{certError}</p>}
        </div>
      )}

      {/* Склав, але не бездоганно — кажемо, що сертифікат узагалі існує і
          що до нього лишилось небагато. Без цього людина просто не знає
          про таку можливість. */}
      {passed && !isPerfect && certificateAllowed && (
        <p className="cp-cert-hint">
          Сертифікат видається за 100% — вам лишилось зовсім небагато.
        </p>
      )}

      {/* При 100% перепроходити нічого — кнопки в блоці немає взагалі.
          Внизу в навігації в цьому випадку стоїть «Перейти на головну»
          (див. navbar), тож двох однакових дій на екрані більше немає. */}
      {!isPerfect && (
        <button type="button" className="btn-primary-full" onClick={onRetake}>
          <span className="btn-label">Пройти ще раз</span>
        </button>
      )}
    </div>
  );
}

/**
 * Питання при поверненні на курс, де вже є незавершений прогрес (localStorage,
 * див. loadProgress вище): блокуючий діалог поверх усього .course-card, а не
 * тихе автовідновлення — людина могла закрити курс навмисно, щоб почати
 * начисто. Поки не обрали — нижче лишається вступний екран, з яким не можна
 * взаємодіяти.
 */
function ResumePrompt({ onResume, onRestart }) {
  return (
    <div className="resume-prompt-overlay" role="presentation">
      <div className="resume-prompt" role="alertdialog" aria-modal="true" aria-label="Продовжити курс">
        <p className="resume-prompt-title">Продовжити з того самого місця?</p>
        <p className="resume-prompt-text">
          Ви вже починали цей курс і не завершили його. Можна продовжити з того місця, де зупинились, або пройти
          курс спочатку.
        </p>
        <div className="resume-prompt-actions">
          <button type="button" className="btn btn-ghost" onClick={onRestart}>
            Спочатку
          </button>
          <button type="button" className="btn btn-primary" onClick={onResume}>
            Продовжити
          </button>
        </div>
      </div>
    </div>
  );
}

export function CoursePlayer({
  course,
  screens,
  enrollmentId,
  lockedNotice,
  // { moreModules, notice } — сесія закінчується раніше за курс (далі
  // модуль під паузою): після останнього модуля сесії — чекпоінт з
  // «На головну», без /submit. Див. app/courses/[slug]/page.js.
  afterSession = null,
  // Прев'ю (конструктор): усі модулі йдуть підряд, а на межах, де в
  // реальному проходженні є пауза, чекпоінт це пояснює. { [moduleId]: days }
  moduleCooldowns = null,
  skippedModuleScores = [],
  // План курсу для першого екрана (lib/coursePlan.ts, вже у вигляді
  // готових рядків). null — у прев'ю конструктора, де ні призначення, ні
  // дедлайну, ні складених модулів не існує.
  plan = null,
  // Назва модуля, коли людина обрала в плані саме його (?module=<id>).
  singleModuleTitle = null,
  hasEmail = true,
  // Режим прев'ю в /admin: той самий плеєр від початку до кінця, але
  // БЕЗ жодного запису — ні в БД, ні в localStorage. Ключ прогресу в
  // localStorage у прев'ю той самий, що й у справжнього курсу, тож без
  // цього автор затирав би реальний прогрес співробітників на своєму
  // ж пристрої.
  previewMode = false,
  // Куди веде "назад" у шапці — /hub/learn для звичайного співробітника,
  // /manager/courses для керівного шару (той самий особистий список
  // курсів, лише в іншому кабінеті — /hub цілком перекидає керівника на
  // /manager, app/hub/layout.js). Рахується один раз у
  // app/courses/[slug]/page.js (там є employee.position.level), не тут.
  backHref = "/hub/learn",
}) {
  const router = useRouter();
  const totalSteps = screens.length + 2; // + вступ + завершення
  const introIdx = 0;
  const completeIdx = screens.length + 1;

  // Обраний у плані модуль (?module=N) стартує одразу з першого екрана:
  // вступ із планом — це те місце, ЗВІДКИ людина натиснула «Почати», і
  // показувати його ще раз означає «нічого не сталося». Для звичайної
  // сесії вступ лишається. Спрацьовує при монтуванні — page.js перемонтовує
  // плеєр по key на кожну зміну модуля.
  const [idx, setIdx] = useState(singleModuleTitle && screens.length > 0 ? introIdx + 1 : introIdx);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [moduleCheckpoint, setModuleCheckpoint] = useState(null);
  // componentId -> скільки елементів гейта вже "зроблено" (відкрито карток,
  // позначено пунктів, прочитано реплік). Живе тут, а не в самому екрані,
  // щоб прогрес не скидався, коли людина йде назад-вперед по курсу.
  const [gateProgress, setGateProgress] = useState({});
  // Фото, відкрите на весь екран (зум по тапу) — з legacy: інакше дрібні
  // деталі на планограмах/скріншотах на телефоні не прочитати.
  const [zoomImage, setZoomImage] = useState(null);

  // Серія правильних відповідей поспіль (streak) — лише в пам'яті на час
  // проходження, у БД не пишеться. streakToast — поточне мотиваційне
  // повідомлення (null = не показано); streakKey змінюється щоразу, щоб
  // React перезапустив CSS-анімацію навіть якщо показуємо той самий текст
  // вдруге поспіль (напр. дві серії по 6 за одне проходження).
  const [streak, setStreak] = useState(0);
  const [streakToast, setStreakToast] = useState(null);
  const streakKeyRef = useRef(0);
  const streakTimerRef = useRef(null);
  const courseStreakMsgs = useMemo(() => courseStreakMessages(course), [course]);

  // Усі quiz-компоненти цієї СЕСІЇ плеєра, пласким списком, у порядку
  // проходження — незалежно від того, скільки їх ділить один Screen з
  // іншими типами. `screens` тепер може бути лише ЧАСТИНОЮ курсу (модулі,
  // вже складені й ще на паузі перепроходження, сюди не потрапляють —
  // lib/courseContent.js getPlayableModules), тому підсумковий бал курсу
  // в submitResult() рахує ЦІ id ПЛЮС збережені scoreRaw/scoreMax
  // пропущених модулів (skippedModuleScores), а не лише ці.
  const quizComponentIds = useMemo(
    () => screens.flatMap((s) => s.components.filter(isScored).map((c) => c.id)),
    [screens]
  );

  // Плаский список усіх компонентів — потрібен, щоб за id знайти сам
  // компонент і спитати в lib/componentTypes.js, чи його гейт уже
  // задоволений (для плавної прокрутки до наступного).
  const allComponents = useMemo(() => screens.flatMap((s) => s.components), [screens]);

  // Бездоганне проходження міняє нижню навігацію фінального екрана:
  // «Назад» ховається, а замість «Пройти ще раз» лишається вихід на
  // головну.
  const isPerfectResult = result?.scorePercent === 100;

  /**
   * Ідеальне завершення "модуля питань" — реального Course Module курсу, а
   * не просто прогону quiz-компонентів поспіль: останнє питання модуля, і
   * всі питання цього ж модуля (включно з цим) відповіли правильно. Так
   * тост долітає і на "незручних" довжинах модуля (3, 4, 7...), які інакше
   * не влучили б у жодну "круглу" віху isScheduledStreak.
   */
  function isPerfectModuleFinish(componentId, isCorrect) {
    if (!isCorrect) return false;
    const segment = moduleSegments.find((s) =>
      screens.slice(s.startIdx, s.endIdx + 1).some((sc) => sc.components.some((c) => c.id === componentId))
    );
    if (!segment) return false;
    const quizIds = screens
      .slice(segment.startIdx, segment.endIdx + 1)
      .flatMap((s) => s.components.filter(isScored).map((c) => c.id));
    if (quizIds.length === 0 || quizIds[quizIds.length - 1] !== componentId) return false;
    return quizIds.every((id) => (id === componentId ? isCorrect : answers[id] === true));
  }

  function handleQuizAnswer(componentId, isCorrect) {
    setAnswers((a) => ({ ...a, [componentId]: isCorrect }));
    // Відповів — показуємо наступний блок так само, як після гейта
    // (акордеон/чекліст/репліки): фідбек і пояснення лишаються на екрані,
    // а наступне питання/точка виглядає знизу.
    scrollToNextComponent(componentId);
    const nextStreak = isCorrect ? streak + 1 : 0;
    setStreak(nextStreak);
    if (isCorrect && (isScheduledStreak(nextStreak) || isPerfectModuleFinish(componentId, isCorrect))) {
      const message = pickStreakMessage(nextStreak, courseStreakMsgs);
      if (message) {
        streakKeyRef.current += 1;
        setStreakToast({ key: streakKeyRef.current, message, streak: nextStreak });
        clearTimeout(streakTimerRef.current);
        streakTimerRef.current = setTimeout(() => setStreakToast(null), 2600);
      }
    }
  }

  /**
   * Плавно підводимо наступний компонент того самого екрана, коли
   * попередній повністю пройдено. На екрані з кількома компонентами
   * наступний часто нижче згину, і людина не бачила, що з'явилось
   * продовження — думала, що екран закінчився.
   *
   * requestAnimationFrame — щоб прокрутка почалась ПІСЛЯ того, як
   * розкритий вміст (остання картка акордеону, остання репліка) уже
   * перемалювався й висота стабілізувалась.
   */
  function scrollToNextComponent(componentId) {
    const el = blockRefs.current.get(componentId);
    const nextId = el?.dataset?.nextComponent;
    if (!nextId) return;
    const nextEl = blockRefs.current.get(Number(nextId));
    if (!nextEl) return;
    // НЕ scrollIntoView({block:"start"}): той ставить наступний компонент
    // під верхній край і прибирає з екрана те, що людина щойно відкрила
    // (реальна скарга: розкрив картку акордеона — і її текст одразу поїхав
    // угору). peekScrollTo лише «показує» наступний блок знизу.
    requestAnimationFrame(() => peekScrollTo(nextEl));
  }

  function handleGateProgress(componentId, done) {
    // Прогрес гейта тільки зростає: повернувшись на екран назад, людина
    // не має "втратити" вже відкриті картки.
    if ((gateProgress[componentId] || 0) >= done) return;
    setGateProgress((g) => ((g[componentId] || 0) >= done ? g : { ...g, [componentId]: done }));
    // Прокрутка — ПОЗА updater'ом setState: у dev React (StrictMode) викликає
    // updater двічі, і екран їхав на подвійний зсув (перевірено 2026-09-14:
    // два scrollBy по 141px на один клік).
    const component = allComponents.find((c) => c.id === componentId);
    if (component && isGateSatisfied(component, done)) scrollToNextComponent(componentId);
  }

  useEffect(() => () => clearTimeout(streakTimerRef.current), []);

  const startedAtRef = useRef(new Date().toISOString());
  // Коли почався ПОТОЧНИЙ модуль (сегмент) — від нього рахується РЕАЛЬНИЙ
  // час на модуль для картки плану курсу (2026-09-17, до цього там завжди
  // стояла лише орієнтовна оцінка). Скидається в goNext() при переході в
  // наступний сегмент. Той самий рівень точності, що вже є в
  // startedAtRef вище для курсу в цілому — не намагаємось точніше
  // враховувати відновлення сесії з localStorage після закриття вкладки.
  const segmentStartRef = useRef(Date.now());

  // Офлайн: просимо SW (public/sw.js) закешувати сторінку курсу і фото всіх
  // екранів наперед — щоб курс, відкритий онлайн, можна було пройти в полі
  // без зв'язку. Усі http(s)-посилання в контенті екранів — це фото.
  useEffect(() => {
    if (previewMode || !("serviceWorker" in navigator)) return;
    const urls = [location.pathname, ...new Set(JSON.stringify(screens).match(/https?:\/\/[^"\\]+/g) || [])];
    navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: "precache", urls })).catch(() => {});
  }, [screens, previewMode]);
  const activeSecondsRef = useRef(0);
  const lastTickRef = useRef(Date.now());

  // Перехід між екранами (Далі/Назад) міняє контент .cp-viewport через
  // idx, БЕЗ зміни URL (весь курс — одна сторінка) — на відміну від
  // .hub-viewport, тут нема навігації роутера, яку можна було б відловити
  // через pathname. Без явного скидання, якщо попередній екран був
  // прогорнутий вниз (довгий текст/фото), наступний відкривався вже "з
  // середини" — верх нового екрана виглядав обрізаним.
  // Наскрізна нумерація КОМПОНЕНТІВ, а не екранів. Раніше номер у кикері
  // дорівнював номеру екрана, і два питання на одному екрані обидва
  // показували «1». Тепер 1, 2, 3… по всьому курсу — людина бачить, де
  // вона в загальному потоці, а не в межах одного кроку.
  const componentNumbers = useMemo(() => numberComponents(screens), [screens]);

  // DOM-вузли блоків компонентів — щоб плавно прокручувати до наступного,
  // коли попередній повністю пройдено.
  const blockRefs = useRef(new Map());
  function registerBlock(componentId, el) {
    if (el) blockRefs.current.set(componentId, el);
    else blockRefs.current.delete(componentId);
  }

  // Перелив «тапни сюди» — лише на ОДНОМУ компоненті екрана: першому
  // згори, чий гейт ще не пройдено. Два гейти на екрані (таймлайн +
  // акордеон) з двома переливами одночасно збивали з пантелику — незрозуміло,
  // з чого починати (користувач, 2026-09-14). Наступний загоряється, коли
  // попередній пройдено; оцінювані (quiz/hotspot) гейта не мають.
  const firstOpenGateId =
    idx > introIdx && idx <= screens.length && !moduleCheckpoint
      ? (screens[idx - 1].components.find((c) => !isScored(c) && !isGateSatisfied(c, gateProgress[c.id]))?.id ?? null)
      : null;

  const viewportRef = useRef(null);
  // Ключ скрол-контейнера: новий екран = НОВИЙ елемент .cp-viewport, тобто
  // scrollTop гарантовано 0 — не «скинутий», а такий від народження. Один
  // лише scrollTo нижче на iPhone не спрацьовував (перевірено користувачем
  // 2026-09-14: 3/12 → 4/12 відкривався з середини): iOS Safari ігнорує
  // програмний scrollTo, поки триває інерційний скрол пальцем, а «Далі»
  // зазвичай тапають одразу після прокрутки донизу. Чекпоінт між модулями
  // теж у ключі — він підміняє вміст без зміни idx.
  const viewportKey = `${idx}-${moduleCheckpoint ? "checkpoint" : "screen"}`;
  useEffect(() => {
    // Страховка для десктопа, де прокручується сторінка, а не контейнер.
    viewportRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [viewportKey]);

  // Відновлення прогресу з localStorage (лише на цьому пристрої — те саме,
  // що й legacy assort_progress_v1; сервер про це не знає). Не застосовуємо
  // збережене одразу — спочатку питаємо користувача (resumePrompt нижче):
  // людина могла закрити курс навмисно, щоб почати начисто, а не тому, що
  // просто відволіклась. Питаємо лише якщо реально є що продовжувати —
  // саме "почали й одразу закрили на вступі" не рахується (немає різниці,
  // з чого починати).
  const [resumePrompt, setResumePrompt] = useState(null);
  useEffect(() => {
    // Одиночний модуль (?module=N) збережений прогрес не читає: у
    // localStorage лежить idx ПОВНОЇ сесії курсу, і в сесії з одного
    // модуля він показує в порожнечу або одразу на екран завершення.
    if (previewMode || singleModuleTitle) return;
    const saved = loadProgress(course.slug);
    if (saved && typeof saved.idx === "number" && saved.idx > introIdx) {
      setResumePrompt(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleResumeContinue() {
    if (resumePrompt) {
      setIdx(resumePrompt.idx);
      if (resumePrompt.answers) setAnswers(resumePrompt.answers);
    }
    setResumePrompt(null);
  }

  function handleResumeRestart() {
    if (!previewMode) clearProgress(course.slug);
    setResumePrompt(null);
  }

  // Пропускаємо ПЕРШЕ спрацювання ефекту збереження нижче: на початковому
  // рендері idx/answers ще мають дефолтні значення (introIdx/{}) — ефект
  // відновлення вище встигає застосувати справжні збережені значення лише
  // ЗГОДОМ, окремим рендером (обидва ефекти монтуються в тому самому
  // проході, у порядку оголошення, і React не чекає стан одного ефекту
  // перед запуском наступного). Без цього пропуску збереження одразу
  // затирало б щойно відновлений прогрес дефолтним idx:0 — саме так курс
  // "забував", де людина зупинилась, після перезавантаження сторінки.
  const skipFirstSaveRef = useRef(true);
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }
    // …і не пише його: інакше індекси одномодульної сесії отруїли б
    // відновлення повної (той самий ключ у localStorage). Модуль короткий —
    // якщо вийшли посередині, він просто починається заново.
    if (!previewMode && !singleModuleTitle && idx !== completeIdx) saveProgress(course.slug, idx, answers);
  }, [idx, answers, course.slug, completeIdx, singleModuleTitle]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        activeSecondsRef.current += (Date.now() - lastTickRef.current) / 1000;
      }
      lastTickRef.current = Date.now();
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // "Пауза між модулями" (Module.cooldownDays): межі модулів усередині
  // screens (0-based) — щоразу, як moduleId змінюється між сусідніми
  // екранами, починається новий сегмент.
  const moduleSegments = useMemo(() => {
    const segments = [];
    for (let i = 0; i < screens.length; i++) {
      const moduleId = screens[i].moduleId;
      const last = segments[segments.length - 1];
      if (last && last.moduleId === moduleId) {
        last.endIdx = i;
      } else {
        segments.push({ moduleId, moduleTitle: screens[i].moduleTitle, startIdx: i, endIdx: i });
      }
    }
    return segments;
  }, [screens]);

  /** Найдовша серія поспіль правильних відповідей у межах ЦИХ id (порядок
   * проходження) — той самий підрахунок, що submitResult() робить по
   * всьому курсу, тут застосований до одного сегмента/модуля. */
  function longestStreakOf(ids) {
    let best = 0;
    let cur = 0;
    for (const id of ids) {
      if (answers[id] === true) {
        cur += 1;
        if (cur > best) best = cur;
      } else {
        cur = 0;
      }
    }
    return best;
  }

  function scoreForSegment(segment) {
    const rangeIds = screens
      .slice(segment.startIdx, segment.endIdx + 1)
      .flatMap((s) => s.components.filter(isScored).map((c) => c.id));
    const scoreRaw = rangeIds.filter((id) => answers[id] === true).length;
    // Поштучні відповіді — для аналітики складності питань у конструкторі.
    const perQuestion = rangeIds
      .filter((id) => answers[id] !== undefined)
      .map((id) => ({ componentId: id, correct: answers[id] === true }));
    const scoreMax = rangeIds.length;
    // Модуль без питань (лише інфо-екрани) нікого не блокує — 100%.
    const scorePercent = scoreMax > 0 ? Math.round((scoreRaw / scoreMax) * 100) : 100;
    return {
      scoreRaw,
      scoreMax,
      scorePercent,
      perQuestion,
      passed: scorePercent >= (course.passThreshold ?? 80),
      longestCorrectStreak: longestStreakOf(rangeIds),
    };
  }

  async function postModuleCompletion(moduleId, score) {
    const url = `/api/courses/${course.slug}/module-complete`;
    const body = {
      enrollmentId,
      moduleId,
      scorePercent: score.scorePercent,
      passed: score.passed,
      longestCorrectStreak: score.longestCorrectStreak,
      scoreRaw: score.scoreRaw,
      scoreMax: score.scoreMax,
      answers: score.perQuestion || [],
      durationSeconds: score.durationSeconds,
    };
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      // Сервер повертає стан «гальма» перескладання (lib/retryPolicy.ts) —
      // саме він вирішує, показати кнопку повтору чи «наступна спроба
      // через …»; на клієнті це рахувати не можна, там немає лічильника
      // спроб і його легко підмінити.
      const data = await res.json().catch(() => null);
      return { error: null, retry: data?.retry || null };
    } catch (err) {
      // Немає мережі — у чергу (lib/offlineOutbox.js), досилається
      // автоматично; порядок «модуль → курс» черга зберігає.
      enqueue(url, body);
      return { error: err.message, retry: null };
    }
  }

  /** Чи задоволені гейти УСІХ компонентів поточного екрана — «Далі»
   * розблоковується лише коли всі до одного "пройдені" (quiz відповіли,
   * accordion розгорнули всі картки тощо). */
  function currentScreenAllowsNext() {
    if (idx === introIdx || idx === completeIdx) return true;
    const screen = screens[idx - 1];
    return screen.components.every((component) =>
      isScored(component) ? answers[component.id] !== undefined : isGateSatisfied(component, gateProgress[component.id])
    );
  }

  /** Текст під навігацією, поки поточний екран ще не "відкрив" кнопку
   * «Далі» — підказка від ПЕРШОГО незадоволеного не-quiz компонента (quiz
   * гейта-підказки не показує, як і раніше — неактивної кнопки досить). */
  function currentGateHint() {
    if (idx === introIdx || idx === completeIdx) return null;
    const screen = screens[idx - 1];
    const blocked = screen.components.find(
      (component) => component.type !== "quiz" && !isGateSatisfied(component, gateProgress[component.id])
    );
    if (!blocked) return null;
    const total = gateTotal(blocked);
    if (total === 0) return null;
    return { text: gateHint(blocked), count: `${gateProgress[blocked.id] || 0}/${total}` };
  }

  async function submitResult() {
    // Бал ЦІЄЇ сесії (лише модулі, що зараз проходились) + бали модулів,
    // пропущених цього разу (уже складені раніше, пауза перепроходження
    // ще діє — lib/courseContent.js getPlayableModules) — інакше бал
    // курсу в цілому "забував" би внесок пропущених модулів щоразу, як
    // людина заходить у курс не з нуля.
    const sessionRaw = quizComponentIds.filter((id) => answers[id] === true).length;
    const sessionMax = quizComponentIds.length;
    const skippedRaw = skippedModuleScores.reduce((sum, m) => sum + (m.scoreRaw || 0), 0);
    const skippedMax = skippedModuleScores.reduce((sum, m) => sum + (m.scoreMax || 0), 0);
    const scoreRaw = sessionRaw + skippedRaw;
    const scoreMax = sessionMax + skippedMax;
    const scorePercent = scoreMax > 0 ? Math.round((scoreRaw / scoreMax) * 100) : 0;
    // Курс "складено" лише якщо КОЖЕН модуль курсу окремо набрав поріг —
    // не сукупний відсоток по всіх питаннях разом (те, що було раніше).
    // Модулі цієї сесії — реальний per-модуль scoreForSegment(...).passed;
    // модулі, пропущені цього разу (вже складені раніше, пауза
    // перепроходження ще діє) — їхнє РЕАЛЬНЕ збережене passed з
    // ModuleCompletion (app/courses/[slug]/page.js), не перерахунок.
    const sessionModulesPassed = moduleSegments.every((s) => scoreForSegment(s).passed);
    const skippedModulesPassed = skippedModuleScores.every((m) => m.passed === true);
    const passed = sessionModulesPassed && skippedModulesPassed;
    const completedAt = new Date().toISOString();
    const durationSeconds = Math.round(
      (new Date(completedAt) - new Date(startedAtRef.current)) / 1000
    );

    setResult({ scoreRaw, scoreMax, scorePercent, passed, submitting: true, submitError: null });
    if (!previewMode) clearProgress(course.slug);

    // Останній модуль курсу теж фіксуємо як складений/ні — РАЗОМ із
    // /submit в одній транзакції (app/api/courses/[slug]/submit/route.js),
    // не двома окремими запитами "паралельно, незалежно один від одного".
    // Два незалежні запити означали, що якщо ОДИН з них не долітав (мережа,
    // помилка сервера), а другий встигав — курс міг позначитись
    // "завершено" з певним балом, а останній модуль лишався взагалі БЕЗ
    // запису про проходження: акордеон курсу показував порожній рядок на
    // місці останнього модуля поруч із загальним "Залік · 100%" — реальний
    // баг, знайдений користувачем. Один атомарний запит унеможливлює цей
    // розсинхрон: або записується все, або нічого.
    const lastSegment = moduleSegments[moduleSegments.length - 1];
    const lastModuleScore = lastSegment ? scoreForSegment(lastSegment) : null;

    // У прев'ю результат лише ПОКАЗУЄМО — жодного запису на сервер.
    if (previewMode) {
      setResult({ scoreRaw, scoreMax, scorePercent, passed, submitting: false, submitError: null });
      return;
    }

    const submitUrl = `/api/courses/${course.slug}/submit`;
    const payload = {
          enrollmentId,
          startedAt: startedAtRef.current,
          completedAt,
          durationSeconds,
          activeTimeSeconds: Math.round(activeSecondsRef.current),
          scoreRaw,
          scoreMax,
          scorePercent,
          passed,
          lastModule: lastSegment
            ? {
                moduleId: lastSegment.moduleId,
                scorePercent: lastModuleScore.scorePercent,
                passed: lastModuleScore.passed,
                longestCorrectStreak: lastModuleScore.longestCorrectStreak,
                scoreRaw: lastModuleScore.scoreRaw,
                scoreMax: lastModuleScore.scoreMax,
              }
            : null,
    };
    try {
      const res = await fetch(submitUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult((r) => ({ ...r, submitting: false }));
    } catch (err) {
      // fetch кинув (не HTTP-помилка) = мережі нема: результат у чергу,
      // OfflineSync.jsx дошле, щойно з'явиться зв'язок.
      if (err instanceof TypeError) {
        enqueue(submitUrl, payload);
        setResult((r) => ({ ...r, submitting: false, queued: true }));
        return;
      }
      setResult((r) => ({ ...r, submitting: false, submitError: err.message }));
    }
  }

  /** Сегмент модуля, у якому лежить 0-based індекс екрану screens[i]. */
  function segmentForScreenIdx(screenIdx) {
    return moduleSegments.find((s) => screenIdx >= s.startIdx && screenIdx <= s.endIdx);
  }

  async function goNext() {
    if (!currentScreenAllowsNext()) return;

    const screenIdx = idx - 1; // idx=1 -> screens[0]
    const segment = idx >= 1 && idx <= screens.length ? segmentForScreenIdx(screenIdx) : null;
    const isLastScreenOfSegment = segment && screenIdx === segment.endIdx;
    const isLastSegmentOfCourse = segment && moduleSegments[moduleSegments.length - 1] === segment;

    // Кінець модуля: чекпоінт (складено/не складено) — між модулями, а
    // також після ОСТАННЬОГО модуля сесії, якщо курс на цьому не
    // закінчується (далі модуль під паузою, afterSession.moreModules):
    // тоді результат модуля зберігається, курс не submit-иться, кнопка —
    // «На головну».
    const sessionEnd = isLastSegmentOfCourse && Boolean(afterSession?.moreModules);
    if (isLastScreenOfSegment && (!isLastSegmentOfCourse || sessionEnd)) {
      const durationSeconds = Math.round((Date.now() - segmentStartRef.current) / 1000);
      segmentStartRef.current = Date.now(); // годинник наступного модуля стартує з чекпоінта
      const score = { ...scoreForSegment(segment), durationSeconds };
      const nextSegment = moduleSegments[moduleSegments.indexOf(segment) + 1];
      const pauseDays = nextSegment && moduleCooldowns ? moduleCooldowns[nextSegment.moduleId] : 0;
      const note = sessionEnd
        ? afterSession.notice
        : pauseDays > 0
          ? `У реальному проходженні тут пауза: модуль «${nextSegment.moduleTitle}» відкриється через ${pauseDays} дн. після складання цього. У прев’ю можна йти далі одразу.`
          : null;
      setModuleCheckpoint({
        ...score,
        moduleId: segment.moduleId,
        moduleTitle: segment.moduleTitle,
        saving: !previewMode,
        saveError: null,
        nextIdx: idx + 1,
        note,
        sessionEnd,
      });
      if (!previewMode) {
        const { error: saveError, retry } = await postModuleCompletion(segment.moduleId, score);
        setModuleCheckpoint((c) => (c ? { ...c, saving: false, saveError, retry } : c));
      }
      return;
    }

    if (idx === completeIdx - 1) {
      const next = idx + 1;
      setIdx(next);
      submitResult();
      return;
    }
    if (idx === completeIdx) return;
    setIdx(idx + 1);
  }

  function handleModuleContinue() {
    if (!moduleCheckpoint) return;
    // Провалений модуль під паузою перескладання: далі по курсу не
    // пускаємо (наступний модуль відкривається лише після СКЛАДАННЯ
    // цього) — виходимо в хаб, звідки видно план і час наступної спроби.
    const retryBlocked = !moduleCheckpoint.passed && moduleCheckpoint.retry?.canRetryNow === false;
    if (moduleCheckpoint.sessionEnd || retryBlocked) {
      if (!previewMode) clearProgress(course.slug);
      router.push("/hub");
      return;
    }
    setIdx(moduleCheckpoint.nextIdx);
    setModuleCheckpoint(null);
  }

  function handleModuleRetry() {
    if (!moduleCheckpoint) return;
    const segment = moduleSegments.find((s) => s.moduleId === moduleCheckpoint.moduleId);
    if (segment) {
      const rangeIds = screens.slice(segment.startIdx, segment.endIdx + 1).flatMap((s) => s.components.map((c) => c.id));
      setAnswers((a) => {
        const next = { ...a };
        rangeIds.forEach((id) => delete next[id]);
        return next;
      });
      setIdx(segment.startIdx + 1);
    }
    setModuleCheckpoint(null);
  }

  function goBack() {
    if (idx === introIdx) return;
    setIdx(idx - 1);
  }

  function handleRetake() {
    if (!previewMode) clearProgress(course.slug);
    setAnswers({});
    setResult(null);
    startedAtRef.current = new Date().toISOString();
    activeSecondsRef.current = 0;
    setIdx(introIdx);
  }

  const progressPct = Math.round((idx / (totalSteps - 1)) * 100);

  return (
    // stage--course-player — вужчий скоуп для десктопного розширення
    // .course-card (globals.css, @media min-width:900px) саме тут, не в
    // /hub чи /register, які й далі лишаються "телефон по центру екрана".
    <div className="stage stage--course-player">
      <div className="course-col">
        <div className="course-card">
          {resumePrompt && <ResumePrompt onResume={handleResumeContinue} onRestart={handleResumeRestart} />}
          {streakToast && (
            <StreakToast key={streakToast.key} icon={streakToast.message.icon} title={streakToast.message.title}
              sub={resolveStreakSub(streakToast.message, streakToast.streak)} />
          )}
          <div className="appbar">
            <button className="iconbtn" aria-label="До списку курсів" onClick={() => router.push(backHref)}>
              <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}>
                <ChevronIcon />
              </span>
            </button>
            <div style={{ flex: 1 }} />
            {/* На вступному екрані (план курсу) лічильник не показуємо —
                план і так показує повний склад курсу й прогрес, номер
                екрана в сесії тут нічого не додає, лише дублює (2026-09-17,
                той самий принцип, що прибрані плашки "екранів/питань/хв"
                над планом). Усередині курсу — лишається: там дійсно корисно
                бачити, скільки ще екранів до кінця сесії. */}
            {idx !== introIdx && (
              <span className="cp-step-count">
                {idx + 1}/{totalSteps}
              </span>
            )}
          </div>

          {/* На ВСТУПНОМУ екрані замість смуги — тонка сіра лінія (той
              самий елемент, клас is-rule): заповнення рахується від номера
              екрана, тож на вступі смуга завжди порожня, а склад курсу й
              так показує лінія часу плану нижче. Усередині курсу смуга
              лишається: саме там вона рухається й дає відчуття, скільки
              ще лишилось (2026-09-17). */}
          <div className={`cp-progress-track${idx === introIdx ? " is-rule" : ""}`}>
            {idx !== introIdx && <div className="cp-progress-fill" style={{ width: `${progressPct}%` }} />}
          </div>

          <div className="cp-viewport" ref={viewportRef} key={viewportKey}>
            {idx === introIdx && (
              <div className="cp-screen cp-intro">
                <h1 className="cp-h1">{course.title}</h1>
                {course.description && <p className="cp-lead">{course.description}</p>}
                {singleModuleTitle && (
                  <p className="cp-note">
                    Ви обрали модуль «{singleModuleTitle}» — проходимо лише його.
                  </p>
                )}
                {/* Плашки "екранів/питань/хв" і банер "пройдіть на 100%!"
                    прибрано (2026-09-17): перші дублювали план нижче
                    бідніше за нього ж, другий не ніс інформації понад бал
                    кожного модуля. Час на курс і статус сертифіката тепер
                    живуть усередині самого плану — lib/coursePlan.ts
                    appendRemainingTime/certificateStatus,
                    components/CoursePlan.tsx. */}
                {/* План курсу сам показує, який модуль коли відкриється,
                    тож окрема плашка про найближчий блок тут була б тим
                    самим текстом двічі. Без плану (прев'ю конструктора)
                    вона лишається єдиним поясненням. */}
                {lockedNotice && !plan && <p className="cp-note">{lockedNotice}</p>}
                {plan && <CoursePlanPanel plan={plan} slug={course.slug} />}
              </div>
            )}

            {moduleCheckpoint ? (
              <ModuleCheckpointScreen
                checkpoint={moduleCheckpoint}
                onContinue={handleModuleContinue}
                onRetry={handleModuleRetry}
              />
            ) : (
              <>
                {idx > introIdx && idx <= screens.length && (
                  <div className="cp-screen">
                    {screens[idx - 1].components.map((component, i) => (
                      <ScreenComponentBlock
                        key={component.id}
                        component={component}
                        screenNumber={componentNumbers.get(component.id) ?? idx}
                        blockRef={(el) => registerBlock(component.id, el)}
                        nextComponentId={screens[idx - 1].components[i + 1]?.id ?? null}
                        answers={answers}
                        onQuizAnswer={handleQuizAnswer}
                        gateProgress={gateProgress}
                        onGateProgress={handleGateProgress}
                        onZoomImage={setZoomImage}
                        tapHint={component.id === firstOpenGateId}
                        questionNumber={quizComponentIds.indexOf(component.id) + 1 || undefined}
                        questionTotal={quizComponentIds.length}
                      />
                    ))}
                  </div>
                )}

                {idx === completeIdx && (
                  <CompleteScreen result={result} onRetake={handleRetake} course={course} hasEmail={hasEmail} previewMode={previewMode} />
                )}
              </>
            )}
          </div>

          {!moduleCheckpoint && (
            <div className="navwrap">
              {/* Поки екран заблокований — пояснюємо ЧОМУ і скільки лишилось,
                  замість мовчазно неактивної кнопки «Далі». */}
              {(() => {
                const hint = currentGateHint();
                if (!hint) return null;
                return (
                  <div className="gate-hint">
                    <span>{hint.text}</span>
                    <span className="gate-hint-count">{hint.count}</span>
                  </div>
                );
              })()}
              <div className={`navbar${isPerfectResult ? " navbar--solo" : ""}`}>
                {/* Після бездоганного проходження повертатись нікуди: «Назад»
                    не рендериться взагалі (не visibility:hidden — той лишав
                    би порожні 80px зліва), і єдина кнопка «Перейти на головну»
                    розтягується на всю ширину (.navbar--solo). На вступному
                    екрані «Назад» лише ховається, щоб «Далі» стояла на тому ж
                    місці, що й на всіх наступних екранах. */}
                {!isPerfectResult && (
                  <button className="btn btn-ghost" onClick={goBack} style={{ visibility: idx === introIdx ? "hidden" : "visible" }}>
                    Назад
                  </button>
                )}
                {idx === completeIdx ? (
                  isPerfectResult ? (
                    // 100% — єдина осмислена дія далі це піти з курсу.
                    <button className="btn btn-primary" onClick={() => (previewMode ? handleRetake() : router.push("/hub"))}>
                      {previewMode ? "Пройти прев'ю ще раз" : "Перейти на головну"}
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={handleRetake}>
                      Пройти ще раз
                    </button>
                  )
                ) : (
                  <button className="btn btn-primary" onClick={goNext} disabled={!currentScreenAllowsNext()}>
                    {idx === completeIdx - 1 ? "Завершити" : "Далі"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {zoomImage && <ImageLightbox src={zoomImage.src} alt={zoomImage.alt} onClose={() => setZoomImage(null)} />}
    </div>
  );
}
