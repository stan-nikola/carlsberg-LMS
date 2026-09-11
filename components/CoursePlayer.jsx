"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { renderRichText } from "@/lib/richText";
import { ChevronIcon, CheckIcon, XIcon, CertificateIcon } from "@/components/icons";
import {
  AccordionScreen,
  ChecklistScreen,
  ScriptScreen,
  TimelineScreen,
  PhotoScreen,
  InputScreen,
  ImageLightbox,
  StreakToast,
} from "@/components/ScreenComponents";
import { isGateSatisfied, gateTotal, gateHint } from "@/lib/componentTypes";
import { courseStreakMessages, pickStreakMessage, resolveStreakSub, isScheduledStreak } from "@/lib/streakMessages";

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
export function ComponentScreen({ component, screenNumber, onGateProgress, onZoomImage }) {
  const common = { component, screenNumber, onGateProgress };
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
      {images
        ?.filter((img) => img.url) // без цього next/image кидає варнінг на
        // порожній src — трапляється, коли в /admin додали слот під фото,
        // але ще не встигли завантажити файл або вписати URL.
        .map((img, i) => {
          const alt = img.caption || component.title || "";
          // Фото клікабельне лише там, де плеєр дав куди його відкрити
          // (onZoomImage) — у статичних контекстах лишається звичайним.
          const zoomable = typeof onZoomImage === "function";
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
              <Image src={img.url} alt={alt} width={800} height={500} style={{ width: "100%", height: "auto" }} />
              {zoomable && (
                <span className="zoom-badge" aria-hidden="true">
                  <ZoomIcon />
                </span>
              )}
              {img.caption && <div className="cp-photo-caption">{img.caption}</div>}
            </div>
          );
        })}
      {body && <div className="cp-body">{renderRichText(body)}</div>}
      {note && <NoteAccordion note={note} />}
    </>
  );
}

function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <line x1="21" y1="21" x2="15.5" y2="15.5" />
    </svg>
  );
}

/** "Підказка" (Component.content.info.note) — розгортається по кліку, а не
 * видима завжди: щоб не перевантажувати екран текстом одразу і трохи
 * заохотити самому подумати перед тим, як підглянути відповідь/деталь. */
function NoteAccordion({ note }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`cp-note-accordion${open ? " open" : ""}`}>
      <button type="button" className="cp-note-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <b>Варто знати</b>
        <span className="cp-note-chevron">
          <ChevronIcon />
        </span>
      </button>
      {open && <div className="cp-note-body">{note}</div>}
    </div>
  );
}

export function QuizScreen({ component, screenNumber, answer, onAnswer }) {
  const { questionType, options } = component.content;
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
      <h2 className="cp-h2">{component.title}</h2>

      <div className="opt-group">
        {options.map((opt, index) => (
          <button
            key={index}
            type="button"
            className={optionClass(opt, index)}
            onClick={() => (questionType === "multi" ? toggleMulti(index) : handleSingleClick(index))}
          >
            {opt.text}
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
          {answer
            ? questionType === "multi"
              ? "Правильно! Усі варіанти обрано вірно."
              : "Правильно!"
            : questionType === "multi"
              ? "Правильні варіанти виділені зеленим."
              : "Правильна відповідь виділена зеленим."}
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
function ScreenComponentBlock({ component, screenNumber, answers, onQuizAnswer, gateProgress, onGateProgress, onZoomImage }) {
  return (
    <div className="screen-component">
      {component.type === "quiz" ? (
        <QuizScreen
          component={component}
          screenNumber={screenNumber}
          answer={answers[component.id]}
          onAnswer={(isCorrect) => onQuizAnswer(component.id, isCorrect)}
        />
      ) : (
        <ComponentScreen
          component={component}
          screenNumber={screenNumber}
          gateDone={gateProgress[component.id]}
          onGateProgress={(done) => onGateProgress(component.id, done)}
          onZoomImage={onZoomImage}
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
  const { moduleTitle, scorePercent, scoreRaw, scoreMax, passed, saving, saveError } = checkpoint;

  return (
    <div className="cp-screen cp-complete">
      <div className={`trophy ${passed ? "win" : ""}`}>{passed ? <CheckIcon /> : <XIcon />}</div>
      <h2 className="result-title">{passed ? `Модуль «${moduleTitle}» складено!` : `Модуль «${moduleTitle}» не складено`}</h2>
      <p className="lead">
        {passed
          ? "Можна переходити до наступного модуля."
          : "Перегляньте матеріал модуля ще раз і спробуйте пройти тести знову."}
      </p>
      {scoreMax > 0 && (
        <div className="score-num">
          <b>
            {scoreRaw}/{scoreMax}
          </b>
          <span> правильних ({scorePercent}%)</span>
        </div>
      )}

      {saving && <p className="cp-save-status">Зберігаємо результат…</p>}
      {saveError && <p className="cp-save-status cp-save-error">Не вдалося зберегти результат: {saveError}</p>}

      <button type="button" className="btn-primary-full" onClick={passed ? onContinue : onRetry}>
        <span className="btn-label">{passed ? "Продовжити" : "Спробувати модуль ще раз"}</span>
      </button>
    </div>
  );
}

function CompleteScreen({ result, onRetake }) {
  if (!result) return null;
  const { scorePercent, scoreRaw, scoreMax, passed, submitting, submitError } = result;

  return (
    <div className="cp-screen cp-complete">
      <div className={`trophy ${passed ? "win" : ""}`}>
        {passed ? <CheckIcon /> : <XIcon />}
      </div>
      <h2 className="result-title">
        {passed ? "Вітаємо! Тест складено успішно 🎉" : "Тест поки не пройдено"}
      </h2>
      <p className="lead">
        {passed
          ? "Ви впевнено знаєте цей матеріал."
          : "Перегляньте розділи ще раз і спробуйте пройти тест знову."}
      </p>
      <div className="score-num">
        <b>
          {scoreRaw}/{scoreMax}
        </b>
        <span> правильних ({scorePercent}%)</span>
      </div>

      {submitting && <p className="cp-save-status">Зберігаємо результат…</p>}
      {submitError && <p className="cp-save-status cp-save-error">Не вдалося зберегти результат: {submitError}</p>}
      {!submitting && !submitError && <p className="cp-save-status">Результат збережено.</p>}

      <button type="button" className="btn-primary-full" onClick={onRetake}>
        <span className="btn-label">Пройти ще раз</span>
      </button>
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

export function CoursePlayer({ course, screens, enrollmentId, lockedNotice, skippedModuleScores = [] }) {
  const router = useRouter();
  const totalSteps = screens.length + 2; // + вступ + завершення
  const introIdx = 0;
  const completeIdx = screens.length + 1;

  const [idx, setIdx] = useState(introIdx);
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
    () => screens.flatMap((s) => s.components.filter((c) => c.type === "quiz").map((c) => c.id)),
    [screens]
  );

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
      .flatMap((s) => s.components.filter((c) => c.type === "quiz").map((c) => c.id));
    if (quizIds.length === 0 || quizIds[quizIds.length - 1] !== componentId) return false;
    return quizIds.every((id) => (id === componentId ? isCorrect : answers[id] === true));
  }

  function handleQuizAnswer(componentId, isCorrect) {
    setAnswers((a) => ({ ...a, [componentId]: isCorrect }));
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

  function handleGateProgress(componentId, done) {
    setGateProgress((g) =>
      // Прогрес гейта тільки зростає: повернувшись на екран назад, людина
      // не має "втратити" вже відкриті картки.
      (g[componentId] || 0) >= done ? g : { ...g, [componentId]: done }
    );
  }

  useEffect(() => () => clearTimeout(streakTimerRef.current), []);

  const startedAtRef = useRef(new Date().toISOString());
  const activeSecondsRef = useRef(0);
  const lastTickRef = useRef(Date.now());

  // Перехід між екранами (Далі/Назад) міняє контент .cp-viewport через
  // idx, БЕЗ зміни URL (весь курс — одна сторінка) — на відміну від
  // .hub-viewport, тут нема навігації роутера, яку можна було б відловити
  // через pathname. Без явного скидання, якщо попередній екран був
  // прогорнутий вниз (довгий текст/фото), наступний відкривався вже "з
  // середини" — верх нового екрана виглядав обрізаним.
  const viewportRef = useRef(null);
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
    // "Пауза між модулями" (ModuleCheckpointScreen) підміняє вміст
    // .cp-viewport БЕЗ зміни idx (idx рухається далі лише по "Продовжити")
    // — без цього прапорця скидання не спрацьовувало саме на переході в
    // чекпоінт і назад.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, Boolean(moduleCheckpoint)]);

  // Відновлення прогресу з localStorage (лише на цьому пристрої — те саме,
  // що й legacy assort_progress_v1; сервер про це не знає). Не застосовуємо
  // збережене одразу — спочатку питаємо користувача (resumePrompt нижче):
  // людина могла закрити курс навмисно, щоб почати начисто, а не тому, що
  // просто відволіклась. Питаємо лише якщо реально є що продовжувати —
  // саме "почали й одразу закрили на вступі" не рахується (немає різниці,
  // з чого починати).
  const [resumePrompt, setResumePrompt] = useState(null);
  useEffect(() => {
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
    clearProgress(course.slug);
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
    if (idx !== completeIdx) saveProgress(course.slug, idx, answers);
  }, [idx, answers, course.slug, completeIdx]);

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
      .flatMap((s) => s.components.filter((c) => c.type === "quiz").map((c) => c.id));
    const scoreRaw = rangeIds.filter((id) => answers[id] === true).length;
    const scoreMax = rangeIds.length;
    // Модуль без питань (лише інфо-екрани) нікого не блокує — 100%.
    const scorePercent = scoreMax > 0 ? Math.round((scoreRaw / scoreMax) * 100) : 100;
    return { scoreRaw, scoreMax, scorePercent, passed: scorePercent >= 80, longestCorrectStreak: longestStreakOf(rangeIds) };
  }

  async function postModuleCompletion(moduleId, score) {
    try {
      await fetch(`/api/courses/${course.slug}/module-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentId,
          moduleId,
          scorePercent: score.scorePercent,
          passed: score.passed,
          longestCorrectStreak: score.longestCorrectStreak,
          scoreRaw: score.scoreRaw,
          scoreMax: score.scoreMax,
        }),
      });
      return null;
    } catch (err) {
      return err.message;
    }
  }

  /** Чи задоволені гейти УСІХ компонентів поточного екрана — «Далі»
   * розблоковується лише коли всі до одного "пройдені" (quiz відповіли,
   * accordion розгорнули всі картки тощо). */
  function currentScreenAllowsNext() {
    if (idx === introIdx || idx === completeIdx) return true;
    const screen = screens[idx - 1];
    return screen.components.every((component) =>
      component.type === "quiz" ? answers[component.id] !== undefined : isGateSatisfied(component, gateProgress[component.id])
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
    const passed = scorePercent >= 80;
    const completedAt = new Date().toISOString();
    const durationSeconds = Math.round(
      (new Date(completedAt) - new Date(startedAtRef.current)) / 1000
    );

    setResult({ scoreRaw, scoreMax, scorePercent, passed, submitting: true, submitError: null });
    clearProgress(course.slug);

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

    try {
      const res = await fetch(`/api/courses/${course.slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult((r) => ({ ...r, submitting: false }));
    } catch (err) {
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

    // Дійшли до кінця модуля, і це НЕ останній модуль курсу — показуємо
    // чекпоінт "Пауза між модулями" замість звичайного переходу вперед.
    if (isLastScreenOfSegment && !isLastSegmentOfCourse) {
      const score = scoreForSegment(segment);
      setModuleCheckpoint({
        ...score,
        moduleId: segment.moduleId,
        moduleTitle: segment.moduleTitle,
        saving: true,
        saveError: null,
        nextIdx: idx + 1,
      });
      const saveError = await postModuleCompletion(segment.moduleId, score);
      setModuleCheckpoint((c) => (c ? { ...c, saving: false, saveError } : c));
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
    clearProgress(course.slug);
    setAnswers({});
    setResult(null);
    startedAtRef.current = new Date().toISOString();
    activeSecondsRef.current = 0;
    setIdx(introIdx);
  }

  const progressPct = Math.round((idx / (totalSteps - 1)) * 100);

  return (
    <div className="stage">
      <div className="course-col">
        <div className="course-card">
          {resumePrompt && <ResumePrompt onResume={handleResumeContinue} onRestart={handleResumeRestart} />}
          {streakToast && (
            <StreakToast key={streakToast.key} icon={streakToast.message.icon} title={streakToast.message.title}
              sub={resolveStreakSub(streakToast.message, streakToast.streak)} />
          )}
          <div className="appbar">
            <button className="iconbtn" aria-label="Назад" onClick={() => router.push("/hub")}>
              <span style={{ transform: "rotate(180deg)", display: "inline-flex" }}>
                <ChevronIcon />
              </span>
            </button>
            <div style={{ flex: 1 }} />
            <span className="cp-step-count">
              {idx + 1}/{totalSteps}
            </span>
          </div>

          <div className="cp-progress-track">
            <div className="cp-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="cp-viewport" ref={viewportRef}>
            {idx === introIdx && (
              <div className="cp-screen cp-intro">
                <h1 className="cp-h1">{course.title}</h1>
                {course.description && <p className="cp-lead">{course.description}</p>}
                <div className="cp-intro-stats">
                  <div className="stat">
                    <b>{screens.length}</b>
                    <span>екранів</span>
                  </div>
                  <div className="stat">
                    <b>{quizComponentIds.length}</b>
                    <span>питань</span>
                  </div>
                </div>
                {/* Заохочення старатись, а не просто "пройти поріг" (80%) —
                    сертифікат видається лише за 100%, за проханням
                    користувача. */}
                <p className="cp-note cp-certificate-hint">
                  <CertificateIcon />
                  <span>Пройдіть курс на всі 100% — і отримаєте іменний сертифікат!</span>
                </p>
                {lockedNotice && <p className="cp-note">{lockedNotice}</p>}
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
                    {screens[idx - 1].components.map((component) => (
                      <ScreenComponentBlock
                        key={component.id}
                        component={component}
                        screenNumber={idx}
                        answers={answers}
                        onQuizAnswer={handleQuizAnswer}
                        gateProgress={gateProgress}
                        onGateProgress={handleGateProgress}
                        onZoomImage={setZoomImage}
                      />
                    ))}
                  </div>
                )}

                {idx === completeIdx && <CompleteScreen result={result} onRetake={handleRetake} />}
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
              <div className="navbar">
                <button className="btn btn-ghost" onClick={goBack} style={{ visibility: idx === introIdx ? "hidden" : "visible" }}>
                  Назад
                </button>
                {idx === completeIdx ? (
                  <button className="btn btn-primary" onClick={handleRetake}>
                    Пройти ще раз
                  </button>
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
