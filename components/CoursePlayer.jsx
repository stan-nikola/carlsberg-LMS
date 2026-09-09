"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { renderRichText } from "@/lib/richText";
import { ChevronIcon, CheckIcon, XIcon } from "@/components/icons";

// MVP-плеєр курсу: портовано з legacy/course-assortment.html, але БЕЗ
// акордеон-гейтів, streak-конфеті, карти розділів і desktop outline —
// свідомо відкладено на потім (домовились при плануванні цього кроку).
// Підтримує лише Lesson.type "info" і "quiz" (single/multi) — рівно те,
// що реально використовується в курсі «Асортимент» (order-питань нема).

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

// Експортуються також для живого прев'ю в /admin (components/AdminCourseEditor.jsx) —
// той самий рендер, що бачить співробітник у плеєрі, не окрема копія розмітки.
export function InfoScreen({ lesson, screenNumber }) {
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
        .map((img, i) => (
          <div className="photo-frame" key={i}>
            <Image src={img.url} alt={img.caption || lesson.title} width={800} height={500} style={{ width: "100%", height: "auto" }} />
            {img.caption && <div className="cp-photo-caption">{img.caption}</div>}
          </div>
        ))}
      {body && <div className="cp-body">{renderRichText(body)}</div>}
      {note && <NoteAccordion note={note} />}
    </div>
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

  useEffect(() => {
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
    if (lesson.type !== "quiz") return true;
    return answers[lesson.id] !== undefined;
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
                    return lesson.type === "quiz" ? (
                      <QuizScreen
                        key={lesson.id}
                        lesson={lesson}
                        screenNumber={idx}
                        answer={answers[lesson.id]}
                        onAnswer={(isCorrect) => setAnswers((a) => ({ ...a, [lesson.id]: isCorrect }))}
                      />
                    ) : (
                      <InfoScreen key={lesson.id} lesson={lesson} screenNumber={idx} />
                    );
                  })()}

                {idx === completeIdx && <CompleteScreen result={result} onRetake={handleRetake} />}
              </>
            )}
          </div>

          {!blockCheckpoint && (
            <div className="navwrap">
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
    </div>
  );
}
