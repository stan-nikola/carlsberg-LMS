"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { enqueue } from "@/lib/offlineOutbox";
import { useRouter } from "next/navigation";
import { getImageProps } from "next/image";
import { ChevronIcon } from "@/components/ui/icons";
import { CoursePlanPanel } from "@/components/course/CoursePlan";
import { DEFAULT_PASS_THRESHOLD, isAnswerDone, scorePercentOf } from "@/lib/grading";
import { newAttemptId } from "@/lib/offlineOutbox";
import { ImageLightbox } from "@/components/course/screens/media";
import { StreakToast } from "@/components/course/screens/celebrate";
import { isGateSatisfied, gateTotal, gateHint, isScored } from "@/lib/componentTypes";
import { courseStreakMessages, pickStreakMessage, resolveStreakSub, isScheduledStreak } from "@/lib/streakMessages";
import { numberComponents } from "@/lib/coursePlayerLogic";
import { peekScrollTo } from "@/lib/scrollHints";
import { isVideoUrl } from "@/lib/videoEmbed";
import { markProgressDirty } from "@/lib/progressDirty";
import { DAY_MS } from "@/lib/ukraineTime";
import { formatDate } from "@/lib/localDate";
import { allModulesPerfect } from "@/lib/progress";
import { loadProgress, saveProgress, buildModuleSegments, nowMs, secondsSince, clearProgress } from "@/components/course/player/progress";
import { ScreenComponentBlock } from "@/components/course/player/screens";
import { ModuleCheckpointScreen, CompleteScreen, ResumePrompt } from "@/components/course/player/finish";
import type { AnswerState } from "@/lib/grading";
import type { CoursePlanView } from "@/lib/coursePlan";
import type { PlayerComponent } from "@/components/course/screens/types";
import type { AfterSession, Answers, CourseResult, ModuleCheckpoint, ModuleSegment, PlayerCourse, PlayerScreen, RetryInfo, SavedProgress, Score } from "@/components/course/player/types";

type ComponentId = PlayerComponent["id"];
/** Відповідь POST /api/courses/:slug/module-complete (lib/moduleAttempts.ts). */
type ModuleCompleteResponse = Score & {
  retry?: RetryInfo | null;
  results?: { componentId: ComponentId; correct: boolean }[];
  pointsEarned?: number;
  course?: (Score & { pointsEarned?: number; certificateEarned?: boolean }) | null;
};

// Плеєр курсу. Крім info/quiz підтримує інтерактивні компоненти, портовані
// з попередньої vanilla-JS розробки "8 кроків телесейлінгу": accordion,
// checklist, script (діалог дзвінка), timeline, а також прості photo/input.
// У кожного свій "гейт" — «Далі» лишається заблокованою, поки співробітник
// реально не провзаємодіє з УСІМА компонентами екрана (правила —
// lib/componentTypes.js). Один Screen може тримати кілька Component,
// розставлених у порядку, — плеєр рендерить їх усі стеком на одному кроці
// (goNext/goBack ходять по ЕКРАНАХ, не по окремих компонентах).
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
  // Відповіді незавершених спроб, уже перевірені сервером
  // (lib/moduleAttempts.ts openAttemptAnswers): { [componentId]: AnswerState }.
  initialAnswers = null,
  // План курсу для першого екрана (lib/coursePlan.ts, вже у вигляді
  // готових рядків). null — у прев'ю конструктора, де ні призначення, ні
  // дедлайну, ні складених модулів не існує.
  plan = null,
  // Назва модуля, коли людина обрала в плані саме його (?module=<id>).
  singleModuleTitle = null,
  // Id того ж модуля — окремий слот прогресу в localStorage, щоб
  // відновлення одиночного модуля не плуталось із повною сесією.
  singleModuleId = null,
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
}: {
  course: PlayerCourse;
  screens: PlayerScreen[];
  enrollmentId: number | null;
  lockedNotice?: string | null;
  afterSession?: AfterSession | null;
  moduleCooldowns?: Record<number, number> | null;
  initialAnswers?: Answers | null;
  plan?: CoursePlanView | null;
  singleModuleTitle?: string | null;
  singleModuleId?: number | null;
  previewMode?: boolean;
  backHref?: string;
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
  // Одиночний модуль стартує одразу з першого екрана (вступ — це те, звідки
  // натиснули «Почати»); повна сесія — зі вступу.
  const initialIdx = singleModuleTitle && screens.length > 0 ? introIdx + 1 : introIdx;
  const [idx, setIdx] = useState(initialIdx);
  // Слот прогресу в localStorage. Одиночний модуль (?module=N) має власний
  // суфікс: у нього інший набір екранів, ніж у повної сесії, і спільний слот
  // означав би, що одне відновлення затирає інше під тим самим slug.
  const storageKey = singleModuleId ? `${course.slug}__m${singleModuleId}` : course.slug;
  // Напрямок анімованого в'їзду картки екрана (2026-09-19, "супер плеєр
  // курсів") — «Далі»/продовження модуля в'їжджають знизу, «Назад»/
  // перескладання в'їжджають зверху (course-player.css
  // .cp-viewport[data-nav]). Чиста CSS-анімація на щойно змонтованому
  // .cp-screen (key={viewportKey} нижче й так перемонтовує його на кожен
  // idx) — швидкий повторний клік «Далі» просто монтує ЩЕ один новий
  // вузол і скасовує попередній: жодного стану "анімація в процесі" не
  // потрібно тримати чи блокувати нею кнопку.
  const [navDirection, setNavDirection] = useState<"forward" | "back">("forward");

  // Прогрів фото сусідніх екранів (аудит швидкодії, 2026-09-19) — без
  // цього <CourseImage> навіть не починає вантажити фото, поки екран не
  // стане поточним (screens[idx-1] — єдиний, що рендериться), тож кожне
  // "Далі"/"Назад" показувало cp-img-skeleton наново, навіть якщо людина
  // вже гортала туди-сюди. rel=preload з imageSrcSet/imageSizes (не
  // просто new Image().src) — next/image генерує кілька кандидатів
  // srcset під різні щільності екрана, і лише таким preload браузер сам
  // вибере ТОЙ САМИЙ файл, що потім реально попросить <Image>, інакше
  // прогрівається не той варіант і кешу однаково нема. getImageProps —
  // офіційний спосіб Next отримати ці атрибути без монтування <Image>.
  useEffect(() => {
    const urls = new Set<string>();
    for (const screen of [screens[idx], screens[idx - 2]]) {
      if (!screen) continue;
      for (const component of screen.components) {
        for (const img of component.content?.images ?? []) {
          // Посилання на ролик тут не місце: це не файл зображення, і
          // next/image на чужому хості одразу кидає «hostname is not
          // configured». Плеєр YouTube/Vimeo гріти нема чим — він тягне
          // своє сам, коли доходить черга (lib/videoEmbed.ts).
          if (img?.url && !isVideoUrl(img.url)) urls.add(img.url);
        }
      }
    }
    if (urls.size === 0) return undefined;
    const links = [...urls].map((url) => {
      const { props } = getImageProps({
        src: url,
        alt: "",
        width: 800,
        height: 500,
        sizes: "(min-width: 900px) 800px, 100vw",
      });
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = props.src;
      if (props.srcSet) link.imageSrcset = props.srcSet;
      if (props.sizes) link.imageSizes = props.sizes;
      document.head.appendChild(link);
      return link;
    });
    return () => links.forEach((link) => link.remove());
  }, [idx, screens]);

  // componentId -> AnswerState (lib/grading.ts). Відповіді, які сервер уже
  // зарахував у незавершеній спробі, — одразу тут: змінити їх однаково не
  // можна, і показувати порожнє питання означало б обман.
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers || {});
  // Помилка перевірки відповіді (напр. модуль закрито паузою в іншій вкладці).
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [result, setResult] = useState<CourseResult | null>(null);
  const [moduleCheckpoint, setModuleCheckpoint] = useState<ModuleCheckpoint | null>(null);
  // componentId -> скільки елементів гейта вже "зроблено" (відкрито карток,
  // позначено пунктів, прочитано реплік). Живе тут, а не в самому екрані,
  // щоб прогрес не скидався, коли людина йде назад-вперед по курсу.
  const [gateProgress, setGateProgress] = useState<Record<string, number>>({});
  // Фото, відкрите на весь екран (зум по тапу) — з legacy: інакше дрібні
  // деталі на планограмах/скріншотах на телефоні не прочитати.
  const [zoomImage, setZoomImage] = useState<{ src: string; alt: string } | null>(null);

  // Серія правильних відповідей поспіль (streak) — лише в пам'яті на час
  // проходження, у БД не пишеться. streakToast — поточне мотиваційне
  // повідомлення (null = не показано); streakKey змінюється щоразу, щоб
  // React перезапустив CSS-анімацію навіть якщо показуємо той самий текст
  // вдруге поспіль (напр. дві серії по 6 за одне проходження).
  const [streak, setStreak] = useState(0);
  const [streakToast, setStreakToast] = useState<{ key: number; message: NonNullable<ReturnType<typeof pickStreakMessage>>; streak: number } | null>(null);
  const streakKeyRef = useRef(0);
  const streakTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const courseStreakMsgs = useMemo(() => courseStreakMessages(course), [course]);

  // Усі quiz-компоненти цієї СЕСІЇ плеєра, пласким списком, у порядку
  // проходження — незалежно від того, скільки їх ділить один Screen з
  // іншими типами. `screens` тепер може бути лише ЧАСТИНОЮ курсу (модулі,
  // вже складені й ще на паузі перепроходження, сюди не потрапляють —
  // lib/courseContent.js getSessionModules), тому підсумковий бал курсу
  // в submitResult() рахує ЦІ id ПЛЮС збережені scoreRaw/scoreMax
  // пропущених модулів (skippedModuleScores), а не лише ці.
  const quizComponentIds = useMemo(
    () => screens.flatMap((s) => s.components.filter(isScored).map((c) => c.id)),
    [screens]
  );

  // Прогрів перевірки відповідей: коли на поточному чи наступному екрані є
  // питання, заздалегідь «будимо» серверну функцію й з'єднання з базою (порожній
  // запит, сервер відповідає 404 без запису). Інакше перший тап по відповіді
  // після паузи чекав холодного старту — ~1–2 с до вердикту. Не частіше разу на хвилину.
  const lastWarmRef = useRef(0);
  useEffect(() => {
    if (previewMode || !enrollmentId) return;
    const hasQuestion = [screens[idx - 1], screens[idx]].some((sc) => sc?.components.some(isScored));
    if (!hasQuestion || Date.now() - lastWarmRef.current < 60_000) return;
    lastWarmRef.current = Date.now();
    fetch(`/api/courses/${course.slug}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  }, [idx, screens, previewMode, enrollmentId, course.slug]);

  const moduleSegments = useMemo(() => buildModuleSegments(screens), [screens]);

  // Плаский список усіх компонентів — потрібен, щоб за id знайти сам
  // компонент і спитати в lib/componentTypes.js, чи його гейт уже
  // задоволений (для плавної прокрутки до наступного).
  const allComponents = useMemo(() => screens.flatMap((s) => s.components), [screens]);

  /**
   * Ідеальне завершення "модуля питань" — реального Course Module курсу, а
   * не просто прогону quiz-компонентів поспіль: останнє питання модуля, і
   * всі питання цього ж модуля (включно з цим) відповіли правильно. Так
   * тост долітає і на "незручних" довжинах модуля (3, 4, 7...), які інакше
   * не влучили б у жодну "круглу" віху isScheduledStreak.
   */
  function isPerfectModuleFinish(componentId: ComponentId, isCorrect: boolean) {
    if (!isCorrect) return false;
    const segment = moduleSegments.find((s) =>
      screens.slice(s.startIdx, s.endIdx + 1).some((sc) => sc.components.some((c) => c.id === componentId))
    );
    if (!segment) return false;
    const quizIds = screens
      .slice(segment.startIdx, segment.endIdx + 1)
      .flatMap((s) => s.components.filter(isScored).map((c) => c.id));
    if (quizIds.length === 0 || quizIds[quizIds.length - 1] !== componentId) return false;
    return quizIds.every((id) => (id === componentId ? isCorrect : answers[id]?.correct === true));
  }

  const moduleIdOfComponent = useMemo(() => {
    const map = new Map<ComponentId, number>();
    for (const s of screens) for (const c of s.components) map.set(c.id, s.moduleId);
    return map;
  }, [screens]);

  /**
   * Відповідь від компонента питання (lib/grading.ts AnswerState). У прев'ю
   * вона вже перевірена локально; у плеєрі — сира, і перевіряє її сервер
   * (POST /api/courses/:slug/answer): ключів відповідей у браузері немає.
   * Без мережі відповідь лишається «pending» і перевіряється разом із
   * завершенням модуля, коли черга дошле його (lib/offlineOutbox.ts).
   */
  async function handleQuizAnswer(componentId: ComponentId, payload: AnswerState) {
    setAnswerError(null);
    if (typeof payload?.correct === "boolean" || previewMode) {
      applyGradedAnswer(componentId, payload);
      return;
    }
    setAnswers((a) => ({ ...a, [componentId]: { status: "checking" as const, response: payload.response } }));
    try {
      const res = await fetch(`/api/courses/${course.slug}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId, moduleId: moduleIdOfComponent.get(componentId), componentId, response: payload.response }),
      });
      if (res.ok) {
        const data = await res.json();
        applyGradedAnswer(componentId, { correct: data.correct, reveal: data.reveal, response: data.response });
        return;
      }
      // Сесія скінчилась чи сервер упав — відповідь не губимо: вона піде
      // разом із завершенням модуля, коли все запрацює.
      if (res.status === 401 || res.status >= 500) throw new TypeError(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      setAnswers((a) => {
        const next = { ...a };
        delete next[componentId];
        return next;
      });
      setAnswerError(data.error || "Не вдалося перевірити відповідь.");
    } catch {
      setAnswers((a) => ({ ...a, [componentId]: { pending: true, response: payload.response } }));
      scrollToNextComponent(componentId);
    }
  }

  function applyGradedAnswer(componentId: ComponentId, answer: AnswerState) {
    const isCorrect = answer.correct === true;
    // Відчутний вердикт — лише Android: iOS Safari/PWA vibrate не має.
    navigator.vibrate?.(isCorrect ? 20 : [30, 60, 30]);
    setAnswers((a) => ({ ...a, [componentId]: answer }));
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
  function scrollToNextComponent(componentId: ComponentId) {
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

  function handleGateProgress(componentId: ComponentId, done: number) {
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

  // Коли почався ПОТОЧНИЙ модуль (сегмент) — від нього рахується РЕАЛЬНИЙ
  // час на модуль для картки плану курсу (2026-09-17, до цього там завжди
  // стояла лише орієнтовна оцінка). Скидається в goNext() при переході в
  // наступний сегмент. Відновлення сесії з localStorage після закриття
  // вкладки точніше не враховуємо. Час курсу в цілому тепер — сума часу
  // модулів на сервері (lib/moduleAttempts.ts finalizeEnrollment).
  const segmentStartRef = useRef(0);
  useEffect(() => {
    segmentStartRef.current = nowMs();
  }, []);

  // Офлайн: просимо SW (public/sw.js) закешувати сторінку курсу і фото всіх
  // екранів наперед — щоб курс, відкритий онлайн, можна було пройти в полі
  // без зв'язку. Усі http(s)-посилання в контенті екранів — це фото.
  useEffect(() => {
    if (previewMode || !("serviceWorker" in navigator)) return;
    // Посилання на відео пропускаємо: ролик лежить на YouTube/Vimeo, його
    // плеєр офлайн усе одно не запуститься, а качати сторінку сервісу в
    // кеш — марно витрачений мобільний трафік співробітника.
    const found = (JSON.stringify(screens).match(/https?:\/\/[^"\\]+/g) || []).filter((u) => !isVideoUrl(u));
    const urls = [location.pathname, ...new Set(found)];
    navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: "precache", urls })).catch(() => {});
  }, [screens, previewMode]);

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
  const blockRefs = useRef(new Map<ComponentId, HTMLElement>());
  function registerBlock(componentId: ComponentId, el: HTMLElement | null) {
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

  const viewportRef = useRef<HTMLDivElement>(null);
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
  const [resumePrompt, setResumePrompt] = useState<SavedProgress | null>(null);
  const sessionKey = screens.map((s) => s.id).join("-");
  useEffect(() => {
    // Одиночний модуль тепер теж відновлюється — у власному слоті storageKey
    // (не плутається з повною сесією). Прев'ю /admin нічого не читає.
    if (previewMode) return;
    const saved = loadProgress(storageKey, sessionKey);
    if (saved && typeof saved.idx === "number" && saved.idx > initialIdx) {
      // localStorage доступний лише після монтування (SSR) — той самий
      // виняток, що вже є в SettingsSheet.jsx / AdminShell.jsx.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResumePrompt(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleResumeContinue() {
    if (resumePrompt) {
      setIdx(resumePrompt.idx);
      // Лише завершені стани відповіді: «перевіряємо» від минулого разу вже
      // не має відповіді сервера, а старий формат (просто true/false, до
      // 2026-09-27) сервер не бачив — такі питання людина відповість знову.
      // Відповіді, які сервер уже зарахував (initialAnswers), — поверх.
      const saved = Object.fromEntries(
        Object.entries(resumePrompt.answers || {}).filter(([, a]) => a && typeof a === "object" && isAnswerDone(a))
      );
      setAnswers({ ...saved, ...(initialAnswers || {}) });
    }
    setResumePrompt(null);
  }

  function handleResumeRestart() {
    if (!previewMode) clearProgress(storageKey);
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
    // Одиночний модуль пише у власний storageKey — не отруює повну сесію.
    // idx > introIdx: на вступі зберігати нічого, а запис {idx:0} затирав
    // би справжній збережений прогрес, поки діалог «продовжити?» ще
    // відкритий (у dev StrictMode ефект спрацьовує двічі — стенд, 2026-09-22).
    if (!previewMode && idx > introIdx && idx !== completeIdx) {
      saveProgress(storageKey, idx, answers, sessionKey);
    }
  }, [idx, answers, storageKey, completeIdx, introIdx, sessionKey, previewMode]);

  function segmentQuestionIds(segment: ModuleSegment) {
    return screens.slice(segment.startIdx, segment.endIdx + 1).flatMap((s) => s.components.filter(isScored).map((c) => c.id));
  }

  /**
   * Бал модуля в ПРЕВ'Ю конструктора (там усе перевірено локально). У
   * справжньому проходженні бал рахує лише сервер (module-complete).
   */
  function previewScoreForSegment(segment: ModuleSegment) {
    const rangeIds = segmentQuestionIds(segment);
    const scoreRaw = rangeIds.filter((id) => answers[id]?.correct === true).length;
    const scoreMax = rangeIds.length;
    const scorePercent = scorePercentOf(scoreRaw, scoreMax);
    return { scoreRaw, scoreMax, scorePercent, passed: scorePercent >= (course.passThreshold ?? DEFAULT_PASS_THRESHOLD) };
  }

  // Ідентифікатор спроби модуля (UUID) — один на модуль у цьому
  // проходженні: повтор того самого завершення з офлайн-черги чи другої
  // вкладки сервер розпізнає й не рахує новою спробою.
  const attemptIdsRef = useRef(new Map<number, string>());
  function attemptIdFor(moduleId: number) {
    if (!attemptIdsRef.current.has(moduleId)) attemptIdsRef.current.set(moduleId, newAttemptId());
    return attemptIdsRef.current.get(moduleId);
  }

  /**
   * Завершення модуля. Бал/«складено» не шлемо — їх рахує сервер із уже
   * перевірених відповідей; у тілі лише відповіді, дані без мережі
   * («pending»), щоб сервер перевірив їх зараз.
   * @returns {{ data: object|null, queued: boolean, error: string|null }}
   */
  async function postModuleCompletion(
    segment: ModuleSegment,
    durationSeconds: number,
  ): Promise<{ data: ModuleCompleteResponse | null; queued: boolean; error: string | null }> {
    const url = `/api/courses/${course.slug}/module-complete`;
    const offlineAnswers = Object.fromEntries(
      segmentQuestionIds(segment)
        .filter((id) => answers[id]?.pending || answers[id]?.status === "checking")
        .map((id) => [id, answers[id]?.response])
    );
    const body = {
      enrollmentId,
      moduleId: segment.moduleId,
      clientAttemptId: attemptIdFor(segment.moduleId),
      answers: offlineAnswers,
      durationSeconds,
    };
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        markProgressDirty();
        return { data: await res.json(), queued: false, error: null };
      }
      const data = await res.json().catch(() => ({}));
      // 4xx (модуль закрито, спроба не з цього модуля) — повтор не допоможе.
      if (res.status !== 401 && res.status < 500) return { data: null, queued: false, error: data.error || `HTTP ${res.status}` };
      throw new TypeError(`HTTP ${res.status}`);
    } catch {
      // Немає мережі, сесія скінчилась чи сервер упав — у чергу
      // (lib/offlineOutbox.ts), дошлеться автоматично й у тому ж порядку.
      enqueue(url, body);
      return { data: null, queued: true, error: null };
    }
  }

  /** Відповіді, перевірені сервером лише під час завершення (дані офлайн), — показати вердикт і в самих питаннях. */
  function applyFinishResults(results: { componentId: ComponentId; correct: boolean }[] | undefined) {
    if (!Array.isArray(results) || results.length === 0) return;
    setAnswers((a) => {
      const next = { ...a };
      for (const r of results) {
        const prev = next[r.componentId];
        if (prev && typeof prev.correct !== "boolean") next[r.componentId] = { ...prev, pending: false, status: undefined, correct: r.correct };
      }
      return next;
    });
  }

  /** Чи задоволені гейти УСІХ компонентів поточного екрана — «Далі»
   * розблоковується лише коли всі до одного "пройдені" (quiz відповіли,
   * accordion розгорнули всі картки тощо). */
  function currentScreenAllowsNext() {
    if (idx === introIdx || idx === completeIdx) return true;
    const screen = screens[idx - 1];
    // Питання — лише коли відповідь перевірено або збережено без мережі;
    // «перевіряємо» ще не пускає далі (інакше завершення модуля обігнало б
    // запис самої відповіді на сервері).
    return screen.components.every((component) =>
      isScored(component) ? isAnswerDone(answers[component.id]) : isGateSatisfied(component, gateProgress[component.id])
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

  /**
   * Останній модуль курсу пройдено. Прев'ю — підсумок рахуємо тут же
   * (усе перевірено локально). Справжнє проходження — завершуємо модуль на
   * сервері; якщо після нього результат є в кожного модуля, сервер сам
   * закриває курс (lib/moduleAttempts.ts finalizeEnrollment) і повертає
   * його підсумок у `course` — бал і «складено» браузер більше не присилає.
   */
  async function finishCourse(segment: ModuleSegment | undefined) {
    if (previewMode) {
      const scores = moduleSegments.map(previewScoreForSegment);
      const scoreRaw = scores.reduce((sum, s) => sum + s.scoreRaw, 0);
      const scoreMax = scores.reduce((sum, s) => sum + s.scoreMax, 0);
      const scorePercent = scorePercentOf(scoreRaw, scoreMax);
      // Курс «складено» лише якщо КОЖЕН модуль окремо набрав поріг;
      // сертифікат у прев'ю — за тим самим правилом, що на сервері.
      setResult({
        scoreRaw,
        scoreMax,
        scorePercent,
        passed: scores.every((s) => s.passed),
        certificateEarned: allModulesPerfect(scores.map((s) => s.scorePercent)),
        submitting: false,
        submitError: null,
      });
      return;
    }
    if (!segment) {
      setResult({ submitting: false, submitError: "У курсі немає модулів для завершення." });
      return;
    }
    setResult({ submitting: true, submitError: null });
    clearProgress(storageKey);
    const durationSeconds = secondsSince(segmentStartRef.current);
    const { data, queued, error } = await postModuleCompletion(segment, durationSeconds);
    if (queued) {
      setResult({ submitting: false, queued: true });
      return;
    }
    if (error || !data) {
      setResult({ submitting: false, submitError: error });
      return;
    }
    applyFinishResults(data.results);
    // course === null — якийсь модуль курсу ще без результату (напр. його
    // додали в конструкторі посеред проходження): показуємо підсумок модуля.
    const summary = data.course ?? data;
    setResult({
      scoreRaw: summary.scoreRaw,
      scoreMax: summary.scoreMax,
      scorePercent: summary.scorePercent,
      passed: summary.passed,
      pointsEarned: summary.pointsEarned ?? 0,
      // Лише від сервера, за всіма модулями курсу (lib/progress.ts certificateEarned);
      // підсумок одного модуля (data без course) сертифіката не дає.
      certificateEarned: data.course?.certificateEarned === true,
      submitting: false,
      submitError: null,
    });
  }

  /** Сегмент модуля, у якому лежить 0-based індекс екрану screens[i]. */
  function segmentForScreenIdx(screenIdx: number) {
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
    const sessionEnd = Boolean(isLastSegmentOfCourse && afterSession?.moreModules);
    if (isLastScreenOfSegment && (!isLastSegmentOfCourse || sessionEnd)) {
      const durationSeconds = secondsSince(segmentStartRef.current);
      segmentStartRef.current = nowMs(); // годинник наступного модуля стартує з чекпоінта
      // Прев'ю рахує бал сам; у справжньому проходженні бал і «складено»
      // приходять лише від сервера — до відповіді чекпоінт нейтральний.
      const score = previewMode ? previewScoreForSegment(segment) : { scoreRaw: null, scoreMax: null, scorePercent: null, passed: null };
      const nextSegment = moduleSegments[moduleSegments.indexOf(segment) + 1];
      const pauseDays = nextSegment && moduleCooldowns ? moduleCooldowns[nextSegment.moduleId] : 0;
      // Пауза рахується від складання, яке щойно сталось — тож дата
      // відкриття відома саме тут, і саме її людина хоче бачити, а не
      // «через 3 дн.» для самостійного підрахунку.
      const opensOn = (days: number) => formatDate(Date.now() + days * DAY_MS);
      const note = sessionEnd
        ? afterSession?.pauseDays
          ? `Модуль «${afterSession.moduleTitle}» відкриється ${opensOn(afterSession.pauseDays)} (через ${afterSession.pauseDays} дн. після складання цього).`
          : afterSession?.notice
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
        const { data, queued, error } = await postModuleCompletion(segment, durationSeconds);
        if (data) applyFinishResults(data.results);
        setModuleCheckpoint((c) =>
          c
            ? {
                ...c,
                saving: false,
                saveError: error,
                queued,
                retry: data?.retry ?? null,
                ...(data ? { scoreRaw: data.scoreRaw, scoreMax: data.scoreMax, scorePercent: data.scorePercent, passed: data.passed } : {}),
              }
            : c
        );
      }
      return;
    }

    if (idx === completeIdx - 1) {
      const next = idx + 1;
      setNavDirection("forward");
      setIdx(next);
      finishCourse(segment ?? undefined);
      return;
    }
    if (idx === completeIdx) return;
    setNavDirection("forward");
    setIdx(idx + 1);
  }

  function handleModuleContinue() {
    if (!moduleCheckpoint) return;
    // Провалений модуль під паузою перескладання: далі по курсу не
    // пускаємо (наступний модуль відкривається лише після СКЛАДАННЯ
    // цього) — виходимо в хаб, звідки видно план і час наступної спроби.
    const retryBlocked = !moduleCheckpoint.passed && moduleCheckpoint.retry?.canRetryNow === false;
    if (moduleCheckpoint.sessionEnd || retryBlocked) {
      if (!previewMode) clearProgress(storageKey);
      router.push("/");
      return;
    }
    setNavDirection("forward");
    setIdx(moduleCheckpoint.nextIdx);
    setModuleCheckpoint(null);
  }

  function handleModuleRetry() {
    if (!moduleCheckpoint) return;
    // Нова спроба = новий пул питань від сервера (детермінований від номера
    // спроби, lib/retryPolicy.ts poolSeed) і нова серверна спроба, тож
    // модуль відкривається заново сторінкою, а не перемотуванням у тій самій:
    // інакше людина отримала б ті самі питання, а сервер — іншу спробу.
    if (!previewMode) {
      clearProgress(storageKey);
      // Повне перезавантаження, не router.push: якщо людина вже на цьому ж
      // ?module=N, клієнтська навігація лишила б плеєр із тим самим станом.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/courses/${course.slug}?module=${moduleCheckpoint.moduleId}`);
      return;
    }
    const segment = moduleSegments.find((s) => s.moduleId === moduleCheckpoint.moduleId);
    if (segment) {
      const rangeIds = screens.slice(segment.startIdx, segment.endIdx + 1).flatMap((s) => s.components.map((c) => c.id));
      setAnswers((a) => {
        const next = { ...a };
        rangeIds.forEach((id) => delete next[id]);
        return next;
      });
      // "back" — повертаємось перескласти вже пройдене, той самий напрям,
      // що й ручне «Назад».
      setNavDirection("back");
      setIdx(segment.startIdx + 1);
    }
    setModuleCheckpoint(null);
  }

  function goBack() {
    if (idx === introIdx) return;
    setNavDirection("back");
    setIdx(idx - 1);
  }

  function handleRetake() {
    // Перескладання курсу — нові спроби й нові пули питань із сервера.
    if (!previewMode) {
      clearProgress(storageKey);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/courses/${course.slug}`);
      return;
    }
    setAnswers({});
    setResult(null);
    segmentStartRef.current = nowMs();
    setNavDirection("back");
    setIdx(introIdx);
  }

  /** Вийти з плеєра на план курсу (сторінка курсу без ?module=): сервер
   *  сам вирішить, показати план із датами відкриття чи наступну сесію. */
  function goToPlan() {
    if (!previewMode) clearProgress(storageKey);
    router.push(`/courses/${course.slug}`);
    router.refresh();
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

          <div className="cp-viewport" ref={viewportRef} key={viewportKey} data-nav={navDirection}>
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
                    components/course/CoursePlan.tsx. */}
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
                onPlan={goToPlan}
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
                        onGateProgress={handleGateProgress}
                        onZoomImage={setZoomImage}
                        tapHint={component.id === firstOpenGateId}
                        questionNumber={quizComponentIds.indexOf(component.id) + 1 || undefined}
                        questionTotal={quizComponentIds.length}
                        staggerIndex={i}
                      />
                    ))}
                  </div>
                )}

                {idx === completeIdx && (
                  <CompleteScreen result={result} onRetake={handleRetake} onPlan={goToPlan} course={course} previewMode={previewMode} />
                )}
              </>
            )}
          </div>

          {!moduleCheckpoint && (
            <div className="navwrap">
              {/* Поки екран заблокований — пояснюємо ЧОМУ і скільки лишилось,
                  замість мовчазно неактивної кнопки «Далі». */}
              {answerError && (
                <p className="cp-save-status cp-save-error" role="alert">
                  {answerError}
                </p>
              )}
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
              <div className={`navbar${idx === completeIdx ? " navbar--solo" : ""}`}>
                {/* На фінальному екрані повертатись нікуди: «Назад» не
                    рендериться взагалі (не visibility:hidden — той лишав би
                    порожні 80px зліва), і єдина кнопка «Перейти на головну»
                    розтягується на всю ширину (.navbar--solo). «Пройти ще
                    раз» живе в самому екрані результату (CompleteScreen) —
                    раніше вона стояла ще й тут, двічі на одному екрані. На
                    вступному екрані «Назад» лише ховається, щоб «Далі»
                    стояла на тому ж місці, що й на всіх наступних екранах. */}
                {idx !== completeIdx && (
                  <button className="btn btn-ghost" onClick={goBack} style={{ visibility: idx === introIdx ? "hidden" : "visible" }}>
                    Назад
                  </button>
                )}
                {idx === completeIdx ? (
                  <button className="btn btn-primary" onClick={() => (previewMode ? handleRetake() : router.push("/"))}>
                    {previewMode ? "Пройти прев'ю ще раз" : "Перейти на головну"}
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
