"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { renderRichText } from "@/lib/richText";
import { ChevronIcon, CheckIcon, XIcon } from "@/components/icons";
import { AccordionScreen, ChecklistScreen, ScriptScreen, TimelineScreen, ImageLightbox, StreakToast } from "@/components/LessonScreens";
import { isGateSatisfied, gateTotal, gateHint } from "@/lib/lessonTypes";
import { courseStreakMessages, pickStreakMessage, resolveStreakSub, isScheduledStreak } from "@/lib/streakMessages";

// Плеєр курсу. Крім info/quiz підтримує інтерактивні екрани, портовані з
// попередньої vanilla-JS розробки "8 кроків телесейлінгу": accordion,
// checklist, script (діалог дзвінка), timeline. У кожного свій "гейт" —
// «Далі» лишається заблокованою, поки співробітник реально не
// провзаємодіє з екраном (правила — lib/lessonTypes.js).
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
 * Диспетчер екранів: за Lesson.type віддає потрібний компонент. Один і
 * той самий і в плеєрі, і в прев'ю /admin — щоб адміністратор бачив рівно
 * те, що побачить співробітник.
 */
export function LessonScreen({ lesson, screenNumber, onGateProgress, onZoomImage }) {
  const common = { lesson, screenNumber, onGateProgress };
  switch (lesson.type) {
    case "accordion":
      return <AccordionScreen {...common} />;
    case "checklist":
      return <ChecklistScreen {...common} />;
    case "script":
      return <ScriptScreen {...common} />;
    case "timeline":
      return <TimelineScreen {...common} />;
    default:
      return <InfoScreen lesson={lesson} screenNumber={screenNumber} onZoomImage={onZoomImage} />;
  }
}

// Експортуються також для живого прев'ю в /admin (components/AdminCourseEditor.jsx) —
// той самий рендер, що бачить співробітник у плеєрі, не окрема копія розмітки.
export function InfoScreen({ lesson, screenNumber, onZoomImage }) {
  const { kicker, lead, body, images, note } = lesson.content || {};
  return (
    <div className="cp-screen">
      {kicker && (
        <div className="cp-kicker">
          <span className="cp-kicker-num">{screenNumber}</span>
          <span>{kicker}</span>
        </div>
      )}
      <h2 className="cp-h2">{lesson.title}</h2>
      {lead && <p className="cp-lead">{lead}</p>}
      {images
        ?.filter((img) => img.url) // без цього next/image кидає варнінг на
        // порожній src — трапляється, коли в /admin додали слот під фото,
        // але ще не встигли завантажити файл або вписати URL.
        .map((img, i) => {
          const alt = img.caption || lesson.title;
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
    </div>
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

/** "Підказка" (Lesson.content.info.note) — розгортається по кліку, а не
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

export function QuizScreen({ lesson, screenNumber, answer, onAnswer }) {
  const { questionType, options } = lesson.content;
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
    <div className="cp-screen">
      <div className="cp-kicker">
        <span className="cp-kicker-num">{screenNumber}</span>
        <span>Питання</span>
      </div>
      <h2 className="cp-h2">{lesson.title}</h2>

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
    </div>
  );
}

/**
 * Проміжний екран між блоками ("Пауза між блоками" — Block.cooldownDays):
 * показується замість звичайного уроку одразу після останнього питання
 * блоку. При провалі (не склав тести блоку) пропонує перепройти саме цей
 * блок, не весь курс — не плутати з CompleteScreen (той для всього курсу).
 */
function BlockCheckpointScreen({ checkpoint, onContinue, onRetry }) {
  const { blockTitle, scorePercent, scoreRaw, scoreMax, passed, saving, saveError } = checkpoint;

  return (
    <div className="cp-screen cp-complete">
      <div className={`trophy ${passed ? "win" : ""}`}>{passed ? <CheckIcon /> : <XIcon />}</div>
      <h2 className="result-title">{passed ? `Блок «${blockTitle}» складено!` : `Блок «${blockTitle}» не складено`}</h2>
      <p className="lead">
        {passed
          ? "Можна переходити до наступного блоку."
          : "Перегляньте матеріал блоку ще раз і спробуйте пройти тести знову."}
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
        <span className="btn-label">{passed ? "Продовжити" : "Спробувати блок ще раз"}</span>
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

export function CoursePlayer({ course, screens, enrollmentId, lockedNotice }) {
  const router = useRouter();
  const totalSteps = screens.length + 2; // + вступ + завершення
  const introIdx = 0;
  const completeIdx = screens.length + 1;

  const [idx, setIdx] = useState(introIdx);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [blockCheckpoint, setBlockCheckpoint] = useState(null);
  // lessonId -> скільки елементів гейта вже "зроблено" (відкрито карток,
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

  /**
   * Ідеальне завершення "блоку питань" — реального Course Block курсу, а
   * не просто прогону quiz-екранів поспіль: останнє питання блоку, і всі
   * питання цього ж блоку (включно з цим) відповіли правильно. Так тост
   * долітає і на "незручних" довжинах блоку (3, 4, 7...), які інакше не
   * влучили б у жодну "круглу" віху isScheduledStreak.
   */
  function isPerfectBlockFinish(lessonId, isCorrect) {
    if (!isCorrect) return false;
    const segment = blockSegments.find((s) =>
      screens.slice(s.startIdx, s.endIdx + 1).some((sc) => sc.id === lessonId)
    );
    if (!segment) return false;
    const quizIds = screens.slice(segment.startIdx, segment.endIdx + 1).filter((s) => s.type === "quiz").map((s) => s.id);
    if (quizIds.length === 0 || quizIds[quizIds.length - 1] !== lessonId) return false;
    return quizIds.every((id) => (id === lessonId ? isCorrect : answers[id] === true));
  }

  function handleQuizAnswer(lessonId, isCorrect) {
    setAnswers((a) => ({ ...a, [lessonId]: isCorrect }));
    const nextStreak = isCorrect ? streak + 1 : 0;
    setStreak(nextStreak);
    if (isCorrect && (isScheduledStreak(nextStreak) || isPerfectBlockFinish(lessonId, isCorrect))) {
      const message = pickStreakMessage(nextStreak, courseStreakMsgs);
      if (message) {
        streakKeyRef.current += 1;
        setStreakToast({ key: streakKeyRef.current, message, streak: nextStreak });
        clearTimeout(streakTimerRef.current);
        streakTimerRef.current = setTimeout(() => setStreakToast(null), 2600);
      }
    }
  }

  useEffect(() => () => clearTimeout(streakTimerRef.current), []);

  const startedAtRef = useRef(new Date().toISOString());
  const activeSecondsRef = useRef(0);
  const lastTickRef = useRef(Date.now());

  // Відновлення прогресу з localStorage (лише на цьому пристрої — те саме,
  // що й legacy assort_progress_v1; сервер про це не знає).
  useEffect(() => {
    const saved = loadProgress(course.slug);
    if (saved) {
      if (typeof saved.idx === "number") setIdx(saved.idx);
      if (saved.answers) setAnswers(saved.answers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const quizLessonIds = useMemo(() => screens.filter((s) => s.type === "quiz").map((s) => s.id), [screens]);

  // "Пауза між блоками" (Block.cooldownDays): межі блоків усередині
  // screens (0-based) — щоразу, як blockId змінюється між сусідніми
  // екранами, починається новий сегмент.
  const blockSegments = useMemo(() => {
    const segments = [];
    for (let i = 0; i < screens.length; i++) {
      const blockId = screens[i].blockId;
      const last = segments[segments.length - 1];
      if (last && last.blockId === blockId) {
        last.endIdx = i;
      } else {
        segments.push({ blockId, blockTitle: screens[i].blockTitle, startIdx: i, endIdx: i });
      }
    }
    return segments;
  }, [screens]);

  function scoreForSegment(segment) {
    const rangeIds = screens.slice(segment.startIdx, segment.endIdx + 1).filter((s) => s.type === "quiz").map((s) => s.id);
    const scoreRaw = rangeIds.filter((id) => answers[id] === true).length;
    const scoreMax = rangeIds.length;
    // Блок без питань (лише інфо-екрани) нікого не блокує — 100%.
    const scorePercent = scoreMax > 0 ? Math.round((scoreRaw / scoreMax) * 100) : 100;
    return { scoreRaw, scoreMax, scorePercent, passed: scorePercent >= 80 };
  }

  async function postBlockCompletion(blockId, score) {
    try {
      await fetch(`/api/courses/${course.slug}/block-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enrollmentId,
          blockId,
          scorePercent: score.scorePercent,
          passed: score.passed,
        }),
      });
      return null;
    } catch (err) {
      return err.message;
    }
  }

  function currentLessonAllowsNext() {
    if (idx === introIdx || idx === completeIdx) return true;
    const lesson = screens[idx - 1];
    if (lesson.type === "quiz") return answers[lesson.id] !== undefined;
    return isGateSatisfied(lesson, gateProgress[lesson.id]);
  }

  /** Текст під навігацією, поки поточний екран ще не "відкрив" кнопку «Далі». */
  function currentGateHint() {
    if (idx === introIdx || idx === completeIdx) return null;
    const lesson = screens[idx - 1];
    if (!lesson || lesson.type === "quiz" || currentLessonAllowsNext()) return null;
    const total = gateTotal(lesson);
    if (total === 0) return null;
    return { text: gateHint(lesson), count: `${gateProgress[lesson.id] || 0}/${total}` };
  }

  async function submitResult() {
    const scoreRaw = quizLessonIds.filter((id) => answers[id] === true).length;
    const scoreMax = quizLessonIds.length;
    const scorePercent = scoreMax > 0 ? Math.round((scoreRaw / scoreMax) * 100) : 0;
    const passed = scorePercent >= 80;
    const completedAt = new Date().toISOString();
    const durationSeconds = Math.round(
      (new Date(completedAt) - new Date(startedAtRef.current)) / 1000
    );

    setResult({ scoreRaw, scoreMax, scorePercent, passed, submitting: true, submitError: null });
    clearProgress(course.slug);

    // Останній блок курсу теж фіксуємо як складений/ні (для звітності й на
    // випадок, якщо до цього курсу пізніше додадуть ще блоки) — паралельно
    // з /submit, не блокуючи один одного.
    const lastSegment = blockSegments[blockSegments.length - 1];
    const lastBlockPromise = lastSegment
      ? postBlockCompletion(lastSegment.blockId, scoreForSegment(lastSegment))
      : Promise.resolve(null);

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
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await lastBlockPromise;
      setResult((r) => ({ ...r, submitting: false }));
    } catch (err) {
      setResult((r) => ({ ...r, submitting: false, submitError: err.message }));
    }
  }

  /** Сегмент блоку, у якому лежить 0-based індекс екрану screens[i]. */
  function segmentForScreenIdx(screenIdx) {
    return blockSegments.find((s) => screenIdx >= s.startIdx && screenIdx <= s.endIdx);
  }

  async function goNext() {
    if (!currentLessonAllowsNext()) return;

    const screenIdx = idx - 1; // idx=1 -> screens[0]
    const segment = idx >= 1 && idx <= screens.length ? segmentForScreenIdx(screenIdx) : null;
    const isLastScreenOfSegment = segment && screenIdx === segment.endIdx;
    const isLastSegmentOfCourse = segment && blockSegments[blockSegments.length - 1] === segment;

    // Дійшли до кінця блоку, і це НЕ останній блок курсу — показуємо
    // чекпоінт "Пауза між блоками" замість звичайного переходу вперед.
    if (isLastScreenOfSegment && !isLastSegmentOfCourse) {
      const score = scoreForSegment(segment);
      setBlockCheckpoint({
        ...score,
        blockId: segment.blockId,
        blockTitle: segment.blockTitle,
        saving: true,
        saveError: null,
        nextIdx: idx + 1,
      });
      const saveError = await postBlockCompletion(segment.blockId, score);
      setBlockCheckpoint((c) => (c ? { ...c, saving: false, saveError } : c));
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

  function handleBlockContinue() {
    if (!blockCheckpoint) return;
    setIdx(blockCheckpoint.nextIdx);
    setBlockCheckpoint(null);
  }

  function handleBlockRetry() {
    if (!blockCheckpoint) return;
    const segment = blockSegments.find((s) => s.blockId === blockCheckpoint.blockId);
    if (segment) {
      const rangeIds = screens.slice(segment.startIdx, segment.endIdx + 1).map((s) => s.id);
      setAnswers((a) => {
        const next = { ...a };
        rangeIds.forEach((id) => delete next[id]);
        return next;
      });
      setIdx(segment.startIdx + 1);
    }
    setBlockCheckpoint(null);
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

          <div className="cp-viewport">
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
                    <b>{quizLessonIds.length}</b>
                    <span>питань</span>
                  </div>
                </div>
                {lockedNotice && <p className="cp-note">{lockedNotice}</p>}
              </div>
            )}

            {blockCheckpoint ? (
              <BlockCheckpointScreen
                checkpoint={blockCheckpoint}
                onContinue={handleBlockContinue}
                onRetry={handleBlockRetry}
              />
            ) : (
              <>
                {idx > introIdx &&
                  idx <= screens.length &&
                  (() => {
                    const lesson = screens[idx - 1];
                    if (lesson.type === "quiz") {
                      return (
                        <QuizScreen
                          key={lesson.id}
                          lesson={lesson}
                          screenNumber={idx}
                          answer={answers[lesson.id]}
                          onAnswer={(isCorrect) => handleQuizAnswer(lesson.id, isCorrect)}
                        />
                      );
                    }
                    return (
                      <LessonScreen
                        key={lesson.id}
                        lesson={lesson}
                        screenNumber={idx}
                        gateDone={gateProgress[lesson.id]}
                        onGateProgress={(done) =>
                          setGateProgress((g) =>
                            // Прогрес гейта тільки зростає: повернувшись на екран
                            // назад, людина не має "втратити" вже відкриті картки.
                            (g[lesson.id] || 0) >= done ? g : { ...g, [lesson.id]: done }
                          )
                        }
                        onZoomImage={setZoomImage}
                      />
                    );
                  })()}

                {idx === completeIdx && <CompleteScreen result={result} onRetake={handleRetake} />}
              </>
            )}
          </div>

          {!blockCheckpoint && (
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
                  <button className="btn btn-primary" onClick={goNext} disabled={!currentLessonAllowsNext()}>
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
