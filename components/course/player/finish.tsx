"use client";

import { useState } from "react";
import { CountUp } from "@/components/ui/CountUp";
import { CertificateIcon, SpinnerIcon } from "@/components/ui/icons";
import { MorphRevealIcon } from "@/components/ui/MorphRevealIcon";
import { ConfettiBurst } from "@/components/course/screens/celebrate";
import { downloadCertificate } from "@/lib/downloadCertificate";
import type { CourseResult, ModuleCheckpoint, PlayerCourse } from "@/components/course/player/types";

/**
 * Проміжний екран між модулями ("Пауза між модулями" — Module.cooldownDays):
 * показується замість звичайного екрана одразу після останнього питання
 * модуля. При провалі (не склав тести модуля) пропонує перепройти саме цей
 * модуль, не весь курс — не плутати з CompleteScreen (той для всього курсу).
 */
export function ModuleCheckpointScreen({
  checkpoint,
  onContinue,
  onRetry,
  onPlan,
}: {
  checkpoint: ModuleCheckpoint;
  onContinue: () => void;
  onRetry: () => void;
  onPlan: () => void;
}) {
  const { moduleTitle, scorePercent, scoreRaw, scoreMax, passed, saving, saveError, queued, note, sessionEnd, retry } = checkpoint;
  // «М'яке гальмо» перескладання: перші спроби підряд вільні, далі коротка
  // пауза. Поки результат зберігається, кнопку не міняємо — інакше вона
  // блимала б із «спробувати» на «зачекайте» і назад.
  const retryBlocked = passed === false && !saving && retry && retry.canRetryNow === false;
  const attemptsLeft = passed === false && retry && typeof retry.attemptsLeft === "number" ? retry.attemptsLeft : null;
  // Бал рахує сервер: поки він не відповів (зберігаємо / немає мережі),
  // вердикту ще нема — не вигадуємо його ні «складено», ні «не складено».
  const unknown = typeof passed !== "boolean";

  if (unknown) {
    return (
      <div className="cp-screen cp-complete">
        <div className="trophy">
          <SpinnerIcon />
        </div>
        <h2 className="result-title">Модуль «{moduleTitle}» завершено</h2>
        {saving && (
          <p className="cp-save-status">
            <SpinnerIcon />
            Перевіряємо відповіді…
          </p>
        )}
        {queued && (
          <>
            <p className="cp-save-status cp-save-queued">
              Немає зв&apos;язку — відповіді збережено на пристрої. Результат модуля порахуємо, щойно з&apos;явиться мережа.
            </p>
            <p className="cp-note">Наступний модуль зарахується, лише якщо цей буде складено.</p>
          </>
        )}
        {saveError && <p className="cp-save-status cp-save-error">Не вдалося зберегти результат: {saveError}</p>}
        {!saving && (
          <button type="button" className="btn-primary-full" onClick={sessionEnd || saveError ? onPlan : onContinue}>
            <span className="btn-label">{sessionEnd || saveError ? "До плану курсу" : "Продовжити"}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`cp-screen cp-complete${passed ? "" : " is-fail-shake"}`}>
      {/* Складений модуль — теж свято, як і фінал курсу (користувач, 2026-09-15). */}
      {passed && <ConfettiBurst />}
      <div className={`trophy ${passed ? "win" : ""}`}>
        <MorphRevealIcon shape={passed ? "check" : "x"} label={passed ? "Складено" : "Не складено"} size={36} strokeWidth={2.4} />
      </div>
      {/* Штамп «з розмаху» (демо-тур, стенд Motion Tuner «C»): склав —
          зелений «СКЛАДЕНО», ні — червоний і коротка встряска екрана. */}
      <span className={`cp-stamp${passed ? "" : " is-fail"}`} aria-hidden="true">
        {passed ? "Складено" : "Не складено"}
      </span>
      <h2 className="result-title">{passed ? `Модуль «${moduleTitle}» складено!` : `Модуль «${moduleTitle}» не складено`}</h2>
      <p className="lead">
        {passed
          ? sessionEnd
            ? "Наступний модуль відкриється після паузи — ми нагадаємо."
            : "Можна переходити до наступного модуля."
          : "Перегляньте матеріал модуля ще раз і спробуйте пройти тести знову."}
      </p>
      {passed && note && <p className="cp-note">{note}</p>}
      {(scoreMax ?? 0) > 0 && (
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
      {/* Без мережі запит іде в чергу (lib/offlineOutbox.ts) — це не
          помилка, а «долетить пізніше»; раніше тут одночасно стояли
          «Результат збережено» і «Не вдалося зберегти: Failed to fetch»
          (стенд механіки, 2026-09-22). */}
      {queued && (
        <p className="cp-save-status cp-save-queued">
          Немає зв&apos;язку — результат збережено на пристрої й відправиться автоматично, щойно з&apos;явиться мережа.
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

      {/* Сесія на цьому закінчується (пауза або гальмо перескладання) —
          дві дороги, обидві названі: план курсу (там дата відкриття і
          решта модулів) і головна. Раніше була лише «На головну», і людина
          не знала, де подивитись, коли їй повертатись. */}
      {(sessionEnd && passed) || retryBlocked ? (
        <>
          <button type="button" className="btn-primary-full" onClick={onPlan}>
            <span className="btn-label">До плану курсу</span>
          </button>
          <button type="button" className="btn btn-ghost cp-complete-secondary" onClick={onContinue}>
            На головну
          </button>
        </>
      ) : (
        <button type="button" className="btn-primary-full" onClick={passed ? onContinue : onRetry}>
          <span className="btn-label">{passed ? "Продовжити" : "Спробувати модуль ще раз"}</span>
        </button>
      )}
    </div>
  );
}

export function CompleteScreen({
  result,
  onRetake,
  onPlan,
  course,
  previewMode,
}: {
  result: CourseResult | null;
  onRetake: () => void;
  onPlan: () => void;
  course: PlayerCourse;
  previewMode?: boolean;
}) {
  const [certDownloading, setCertDownloading] = useState(false);
  const [certError, setCertError] = useState("");

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
      await downloadCertificate(course.slug);
    } catch (err) {
      setCertError((err as Error).message || "Не вдалося завантажити сертифікат.");
    } finally {
      setCertDownloading(false);
    }
  }

  if (!result) return null;
  const { scorePercent, scoreRaw, scoreMax, passed, submitting, submitError, queued, pointsEarned = 0, certificateEarned = false } = result;

  // Підсумок курсу рахує сервер — поки його нема (перевіряємо / немає
  // мережі / помилка), без вердикту й без балу.
  if (typeof passed !== "boolean") {
    return (
      <div className="cp-screen cp-complete">
        <div className="trophy">
          <SpinnerIcon />
        </div>
        <h2 className="result-title">Курс завершено</h2>
        {submitting && (
          <p className="cp-save-status">
            <SpinnerIcon />
            Перевіряємо відповіді й рахуємо результат…
          </p>
        )}
        {queued && (
          <p className="cp-save-status cp-save-queued">
            Немає мережі — відповіді збережено на пристрої. Результат і сертифікат з&apos;являться, щойно відновиться зв&apos;язок.
          </p>
        )}
        {submitError && <p className="cp-save-status cp-save-error">Не вдалося зберегти результат: {submitError}</p>}
        {!submitting && (
          <button type="button" className="btn btn-ghost cp-complete-secondary" onClick={onPlan}>
            До плану курсу
          </button>
        )}
      </div>
    );
  }

  // Сертифікат — за правилом lib/progress.ts certificateEarned (кожен модуль
  // на 100%), вердикт рахує сервер разом із підсумком курсу.
  const certificateAllowed = course?.certificateEnabled !== false;
  const isPerfect = scorePercent === 100;
  const showCertificate = certificateEarned && certificateAllowed;
  // Не «бал нижче 100», а «сертифіката немає»: курсові 100% можуть стояти й
  // тоді, коли окремий старий модуль записано округленим балом.
  const canImprove = passed && !certificateEarned;
  // Кнопку тримаємо неактивною, поки результат не долетів до сервера:
  // роут сертифіката перевіряє саме збережений Enrollment і до того
  // моменту відповів би 403.
  const certificateReady = !submitting && !submitError && !queued;

  return (
    <div className="cp-screen cp-complete">
      {/* Свято лише за бездоганне проходження — тоді воно щось означає. */}
      {isPerfect && <ConfettiBurst />}
      <div className={`trophy ${passed ? "win" : ""}`}>
        <MorphRevealIcon shape={passed ? "check" : "x"} label={passed ? "Складено" : "Не складено"} size={36} strokeWidth={2.4} />
      </div>
      {/* «+N балів» спливає з трофея (анімація з демо-туру) і лишається
          плашкою: сума приходить з сервера разом із підсумком курсу. */}
      {passed && pointsEarned > 0 && (
        <span className="cp-points-chip">
          <CountUp to={pointsEarned} from={0} prefix="+" delayMs={600} /> балів
        </span>
      )}
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
        <div className="cp-cert-block is-new">
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

      {/* Не склав — перескласти весь курс (сесія з нескладених модулів).
          Склав, але не на 100% — покращувати варто ОКРЕМИЙ слабший модуль
          із плану, не весь курс заново. Внизу в навігації в обох випадках
          стоїть «Перейти на головну» (див. navbar). */}
      {!passed && (
        <button type="button" className="btn-primary-full" onClick={onRetake}>
          <span className="btn-label">Пройти ще раз</span>
        </button>
      )}
      {/* Склав, але не на 100% — кажемо прямо, що сертифікат саме за це й
          не виданий (щоб мовчазна відсутність блоку вище не читалась як
          збій), а покращувати варто ОКРЕМИЙ слабший модуль із плану, не
          весь курс заново. */}
      {canImprove && certificateAllowed && (
        <p className="cp-cert-hint">Сертифікат видається за 100% — вам лишилось зовсім небагато.</p>
      )}
      {canImprove && !previewMode && (
        <button type="button" className="btn btn-ghost cp-complete-secondary" onClick={onPlan}>
          До плану курсу — покращити результат
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
export function ResumePrompt({ onResume, onRestart }: { onResume: () => void; onRestart: () => void }) {
  return (
    <div className="resume-prompt-overlay" role="presentation">
      <div className="resume-prompt" role="alertdialog" aria-modal="true" aria-label="Продовжити курс">
        <p className="resume-prompt-title">Продовжити з того самого місця?</p>
        <p className="resume-prompt-text">
          Ви вже починали цей курс і не завершили його. Можна продовжити з того місця, де зупинились, або почати
          заново — з першого ще не складеного модуля.
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
