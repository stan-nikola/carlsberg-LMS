"use client";

import { useMemo, useState } from "react";
import { renderRichMarks } from "@/lib/richText";
import { QuestionIcon } from "@/components/ui/icons";
import { MorphRevealIcon } from "@/components/ui/MorphRevealIcon";
import { AnswerStatus } from "@/components/course/AnswerStatus";
import { answerFor, isAnswerDone, viewContent } from "@/lib/grading";
import { ScreenMedia } from "@/components/course/screens/media";
import { shuffleArray } from "@/lib/coursePlayerLogic";
import type { QuestionScreenProps } from "@/components/course/screens/types";

/**
 * Питання з варіантами. Ключів відповідей у плеєрі немає (lib/grading.ts
 * publicContent, 2026-09-27): вибір іде нагору сирим { selected: [key] },
 * а правильність і розбір приходять у `answer` від сервера. У прев'ю
 * конструктора (повний вміст) перевірка локальна — тим самим кодом.
 * `answer`: undefined | {status:"checking"} | {correct, reveal, response} | {pending, response}.
 */
/** Варіант, як його бачить плеєр: непрозорий key замість індексу. */
type QuizOptionView = { key: string; text: string };
/** Розбір варіанта після відповіді. */
type RevealOption = { key: string; correct?: boolean; explanation?: string };
type QuizView = { questionType?: string; shuffleOptions?: boolean; options: QuizOptionView[] };

export function QuizScreen({ component, screenNumber, answer, onAnswer, onZoomImage, questionNumber, questionTotal }: QuestionScreenProps) {
  const view = useMemo(
    () => viewContent("quiz", component.content, component.id) as unknown as QuizView,
    [component.content, component.id],
  );
  const { questionType, shuffleOptions } = view;
  // Перемішуємо ОДИН раз при монтуванні: інакше варіанти стрибали б на
  // кожен ререндер (а він тут є — вибір у multi). Порядок живий лише поки
  // екран відкритий; повернувшись пізніше, людина побачить новий — так
  // само поводився legacy-курс.
  const [options] = useState<QuizOptionView[]>(() => (shuffleOptions === false ? view.options : shuffleArray(view.options)));
  const [picked, setPicked] = useState<string[]>([]);
  // Відповідь дана саме зараз (а не відновлена після перезавантаження) —
  // лише тоді кружечок «виринає» з вердиктом.
  const [live, setLive] = useState(false);
  const checking = answer?.status === "checking";
  const graded = typeof answer?.correct === "boolean";
  const isAnswered = checking || isAnswerDone(answer);
  // Після перезавантаження сторінки власного вибору в стані компонента вже
  // нема — показуємо той, що записано у відповіді (сервер/відновлення).
  const response = answer?.response as { selected?: string[] } | undefined;
  const selected: string[] = isAnswered && Array.isArray(response?.selected) ? response.selected : picked;
  const reveal = (graded ? answer?.reveal : null) as { options?: RevealOption[]; explanation?: string } | null | undefined;
  const revealByKey = new Map((reveal?.options || []).map((o) => [o.key, o]));
  const explanation = reveal?.explanation;

  function submit(keys: string[]) {
    setLive(true);
    onAnswer(answerFor("quiz", component.content, { selected: keys }));
  }

  function handleSingleClick(key: string) {
    if (isAnswered) return;
    setPicked([key]);
    submit([key]);
  }

  function toggleMulti(key: string) {
    if (isAnswered) return;
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function submitMulti() {
    if (isAnswered) return;
    submit(picked);
  }

  /**
   * Які пояснення показати після відповіді. Не всі підряд: обраний
   * невірний варіант («чому це не так») і пропущений правильний («що
   * треба було обрати»). Правильний обраний варіант теж пояснюємо — його
   * могли вгадати.
   */
  const optionFeedback = graded
    ? options
        .map((opt) => {
          const r = revealByKey.get(opt.key);
          if (!r?.explanation) return null;
          const chosen = selected.includes(opt.key);
          if (chosen && !r.correct) return { key: opt.key, kind: "is-wrong", text: opt.text, explanation: r.explanation };
          if (r.correct) return { key: opt.key, kind: "is-correct", text: opt.text, explanation: r.explanation };
          return null;
        })
        .filter((f) => f !== null)
    : [];

  function optionClass(opt: QuizOptionView) {
    const classes = ["opt"];
    if (isAnswered) {
      classes.push("disabled");
      const r = revealByKey.get(opt.key);
      if (r?.correct) classes.push("correct");
      // Без розбору (помилка в тесті з кількома правильними) не знаємо, які з
      // обраних були вірні — лишаємо вибір нейтральним.
      else if (selected.includes(opt.key)) classes.push(r ? "wrong" : "selected");
    } else if (selected.includes(opt.key)) {
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
        {/* Тип відповіді живе САМЕ тут (2026-09-23, рішення користувача):
            окрема зелена пілюля «Один варіант / Кілька правильних» над
            питанням прибрана, бо казала те саме, що й ця плашка, лише
            іншими словами й кольором. */}
        <span className="quiz-banner-txt">
          <b>Блок питань</b>
          <span>
            {questionNumber && questionTotal ? `Питання ${questionNumber} з ${questionTotal} · ` : ""}
            {questionType === "multi" ? "оберіть декілька правильних відповідей" : "оберіть одну правильну відповідь"}
          </span>
        </span>
      </div>
      <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>
      {/* Фото між питанням і варіантами — питання може спиратись саме на
          зображення ("що не так на цій викладці?"). */}
      <ScreenMedia images={component.content?.images} title={component.title} onZoomImage={onZoomImage} />

      <div className="opt-group">
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={optionClass(opt)}
            onClick={() => (questionType === "multi" ? toggleMulti(opt.key) : handleSingleClick(opt.key))}
          >
            {/* Маркер вибору — кружечок для одного варіанта, квадратик із
                галочкою для кількох. Повернуто з legacy-курсу: без нього
                по варіанту не видно, що він взагалі вибирається, поки не
                натиснеш.
                ПІСЛЯ відповіді всередину малюється підсумок (рішення
                користувача, 2026-09-23): зелений кружечок — галочка,
                червоний — хрестик, обидві «промальовуються» тим самим
                MorphRevealIcon, що вже є в плані курсу й у статус-бейджі. */}
            {/* Поки сервер перевіряє — кружечок обраного варіанта «тоне» з
                хвилею, з вердиктом виринає з галочкою чи хрестиком
                (course-player.css, «крапля у воду»). */}
            <span
              className={`opt-mark${questionType === "multi" ? " chk" : ""}${
                selected.includes(opt.key) ? (checking ? " is-checking" : graded && live ? " is-verdict" : "") : ""
              }`}
              aria-hidden={!graded}
            >
              {graded && revealByKey.get(opt.key) && (revealByKey.get(opt.key)?.correct || selected.includes(opt.key)) && (
                <MorphRevealIcon
                  shape={revealByKey.get(opt.key)?.correct ? "check" : "x"}
                  label={revealByKey.get(opt.key)?.correct ? "Правильно" : "Неправильно"}
                  size={12}
                  strokeWidth={3}
                  className="opt-mark-ico"
                />
              )}
            </span>
            <span className="opt-text">{renderRichMarks(opt.text)}</span>
          </button>
        ))}
      </div>

      {questionType === "multi" && (!isAnswered || checking) && (
        <button
          type="button"
          className={`btn-primary-full${checking ? " is-checking" : ""}`}
          onClick={submitMulti}
          disabled={picked.length === 0}
          aria-busy={checking}
        >
          <span className="btn-label">Перевірити</span>
        </button>
      )}

      <AnswerStatus answer={answer} />

      {graded && (
        <div className={`q-fb show ${answer.correct ? "ok" : "bad"}`}>
          <b className="q-fb-verdict">
            {answer.correct
              ? questionType === "multi"
                ? "Правильно! Усі варіанти обрано вірно."
                : "Правильно!"
              : questionType === "multi"
                ? "Не всі варіанти обрано вірно. Спробуйте ще раз у наступній спробі."
                : "Неправильно. Спробуйте ще раз у наступній спробі."}
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
                <li key={o.key} className={o.kind}>
                  <b>{renderRichMarks(o.text)}</b>
                  <span>{renderRichMarks(o.explanation)}</span>
                </li>
              ))}
            </ul>
          )}
          {explanation && <span className="q-fb-explain">{renderRichMarks(explanation)}</span>}
        </div>
      )}
    </>
  );
}
