"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronIcon, CheckIcon } from "@/components/icons";
import { isHotspotHit } from "@/lib/componentTypes";
import { peekScrollTo } from "@/lib/scrollHints";

/**
 * Інтерактивні компоненти екрана, портовані з попередньої vanilla-JS
 * розробки ("8 кроків телесейлінгу") + прості photo/input. Спільні для
 * плеєра (components/CoursePlayer.jsx) і живого прев'ю в /admin — щоб
 * адміністратор бачив рівно те саме, що й співробітник, а не окрему
 * приблизну копію.
 *
 * Контракт у всіх однаковий:
 *   component     — { title, type, content }
 *   screenNumber  — номер екрана для kicker'а
 *   onGateProgress(doneCount) — скільки елементів уже "зроблено"; плеєр
 *                   сам вирішує, чи цього досить (lib/componentTypes.js).
 * Стан взаємодії живе В КОМПОНЕНТІ (а не в плеєрі) навмисно: він
 * ефемерний, у БД не пишеться — при поверненні на екран людина бачить
 * уже відкриті картки, поки не перезавантажить курс.
 */

/**
 * Фото курсу зі скелетоном, поки воно вантажиться.
 *
 * Блок займає РІВНО той самий розмір, що й майбутнє фото (aspect-ratio
 * 800/500 — ті самі пропорції, з якими рендериться next/image), тому при
 * появі картинки нічого не стрибає: скелетон не «зникає, звільняючи
 * місце», а просто підмінюється зображенням на місці.
 *
 * onLoad спрацьовує і для фото з кешу, але там воно вже complete на
 * першому рендері — тому перевіряємо це в ефекті окремо, інакше на
 * повторному відкритті екрана скелетон завис би назавжди (подія вже
 * відбулась до того, як ми підписались).
 */
export function CourseImage({ src, alt, onLoaded }) {
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    // Фото з кешу вже complete на першому рендері — подія onLoad для
    // нього не спрацює, і без цієї перевірки скелетон завис би назавжди.
    const img = wrapRef.current?.querySelector("img");
    if (img?.complete && img.naturalWidth > 0) {
      setLoaded(true);
      onLoaded?.();
    }
  }, [src, onLoaded]);

  return (
    <div ref={wrapRef} className={`cp-img-wrap${loaded ? " is-loaded" : ""}`}>
      {!loaded && <span className="cp-img-skeleton" aria-hidden="true" />}
      <Image
        src={src}
        alt={alt}
        width={800}
        height={500}
        style={{ width: "100%", height: "auto" }}
        // eager, а не типовий lazy. Фото завжди на ПОТОЧНОМУ екрані (їх
        // щонайбільше три) і призначене, щоб його роздивлялись одразу —
        // відкладати нічого. Плюс ліниве завантаження тут просто не
        // спрацьовувало в прев'ю /admin: .adm-shell несе zoom:85%, і
        // браузер не вважав картинку видимою — img лишався з порожнім
        // currentSrc назавжди, а скелетон світився вічно (перевірено:
        // окремий new Image() з тим самим src вантажився за 7мс).
        loading="eager"
        onLoad={() => {
          setLoaded(true);
          onLoaded?.();
        }}
        // Не показувати скелетон вічно, якщо файл узагалі не відкрився.
        onError={() => {
          setLoaded(true);
          onLoaded?.();
        }}
      />
    </div>
  );
}

function Kicker({ screenNumber, text }) {
  if (!text) return null;
  return (
    <div className="cp-kicker">
      <span className="cp-kicker-num">{screenNumber}</span>
      <span>{text}</span>
    </div>
  );
}

/**
 * Фото компонента — спільний блок для ВСІХ типів екрана, не лише для
 * "фото". Фото стоїть одразу після вступного рядка й перед власним
 * вмістом типу: у тому самому місці, де воно в конструкторі, щоб автор
 * бачив той самий порядок, який редагує.
 *
 * Нічого не рендерить, якщо жодне фото ще не має url — слот у
 * конструкторі створюють раніше, ніж встигає завантажитись файл, а
 * next/image на порожньому src кидає варнінг.
 */
export function ScreenMedia({ images, title, onZoomImage }) {
  const valid = (images || []).filter((img) => img.url);
  if (valid.length === 0) return null;
  const zoomable = typeof onZoomImage === "function";

  return (
    <div className="cp-screen-media">
      {valid.map((img, i) => {
        const alt = img.caption || title || "";
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
            <CourseImage src={img.url} alt={alt} />
            {img.caption && <div className="cp-photo-caption">{img.caption}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ===================== ACCORDION ===================== */

export function AccordionScreen({ component, screenNumber, onGateProgress, onZoomImage }) {
  const { kicker, lead, images = [], items = [] } = component.content || {};
  // Відкрита картка більше НЕ закривається — ні кліком по ній, ні
  // відкриттям сусідньої. Раніше відкритою могла бути лише одна, і щоб
  // порівняти дві картки, доводилось перемикатись туди-сюди по пам'яті.
  // Тепер прочитане лишається перед очима. Той самий стан і для гейта:
  // «відкрито» = «зараховано».
  const [everOpened, setEverOpened] = useState(() => new Set());

  useEffect(() => {
    onGateProgress?.(everOpened.size);
  }, [everOpened, onGateProgress]);

  const listRef = useRef(null);
  // Наступна ще не відкрита картка — саме її підсвічуємо переливом.
  const nextIdx = items.findIndex((_, i) => !everOpened.has(i));

  function toggle(i) {
    if (everOpened.has(i)) return;
    setEverOpened((prev) => new Set(prev).add(i));
    // Підводимо картку, що йде ЗА цією, а не «першу невідкриту»: людина
    // читає згори вниз, і стрибок назад збивав би. peekScrollTo лишає
    // щойно відкритий текст на екрані — саме тому, що scrollIntoView
    // ховав його під верхній край.
    const following = listRef.current?.children?.[i + 1];
    requestAnimationFrame(() => peekScrollTo(following));
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{component.title}</h2>}
      {lead && <p className="cp-lead">{lead}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />
      <div className="acc-list" ref={listRef}>
        {items.map((item, i) => (
          <div key={i} className={`acc-item${everOpened.has(i) ? " open seen" : ""}`}>
            <button
              type="button"
              className={`acc-head${i === nextIdx ? " tap-next" : ""}`}
              onClick={() => toggle(i)}
              aria-expanded={everOpened.has(i)}
            >
              <span className="acc-title">{item.title || `Картка ${i + 1}`}</span>
              <span className="acc-chevron">
                <ChevronIcon />
              </span>
            </button>
            {everOpened.has(i) && <div className="acc-body">{item.body}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

/* ===================== CHECKLIST ===================== */

export function ChecklistScreen({ component, screenNumber, onGateProgress, onZoomImage }) {
  const { kicker, lead, images = [], items = [] } = component.content || {};
  const [checked, setChecked] = useState(() => new Set());
  const nextIdx = items.findIndex((_, i) => !checked.has(i));

  useEffect(() => {
    onGateProgress?.(checked.size);
  }, [checked, onGateProgress]);

  function toggle(i) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{component.title}</h2>}
      {lead && <p className="cp-lead">{lead}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />
      <div className="check-list">
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            className={`check-item${checked.has(i) ? " done" : ""}${i === nextIdx ? " tap-next" : ""}`}
            onClick={() => toggle(i)}
            aria-pressed={checked.has(i)}
          >
            <span className="check-box">
              <CheckIcon />
            </span>
            <span className="check-text">{item.text}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ===================== SCRIPT (діалог дзвінка) ===================== */

// Підпис за замовчуванням для ролі. Перебивається власним b.label із
// конструктора (для співрозмовника, якого немає в списку ролей).
// "note" навмисно без підпису — це ремарка, а не чиясь репліка.
const BUBBLE_LABELS = {
  me: "Ви кажете",
  client: "Клієнт",
  manager: "Керівник",
  colleague: "Колега",
  tip: "Порада",
  note: "",
};

export function ScriptScreen({ component, screenNumber, onGateProgress, onZoomImage }) {
  const { kicker, lead, images = [], callLabel, bubbles = [] } = component.content || {};
  const [revealed, setRevealed] = useState(0);
  const [typing, setTyping] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const advanceRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    onGateProgress?.(revealed);
  }, [revealed, onGateProgress]);

  // Таймер "дзвінка" — суто атмосферний елемент із legacy, показує, що
  // розмова триває, поки людина читає репліки.
  useEffect(() => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  function revealNext() {
    if (typing || revealed >= bubbles.length) return;
    setTyping(true);
    // Пауза з індикатором "друкує" — саме вона робить діалог схожим на
    // живу розмову, а не на стіну тексту, що з'явилась миттєво.
    setTimeout(() => {
      setTyping(false);
      setRevealed((n) => n + 1);
      requestAnimationFrame(() => {
        try {
          advanceRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch {
          /* старі браузери без smooth-скролу — не критично */
        }
      });
    }, 620);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const done = revealed >= bubbles.length;

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{component.title}</h2>}
      {lead && <p className="cp-lead">{lead}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />

      <div className="script-wrap">
        <div className="call-bar">
          <span className="call-dot" />
          <span className="call-label">{callLabel || "Дзвінок із клієнтом"}</span>
          <span className="call-time">
            {mm}:{ss}
          </span>
        </div>
        <div className="script-dots">
          {bubbles.map((_, i) => (
            <span key={i} className={i < revealed ? "on" : ""} />
          ))}
        </div>

        {bubbles.slice(0, revealed).map((b, i) => (
          <div key={i} className={`bubble ${b.role || "me"}`}>
            {(b.label || BUBBLE_LABELS[b.role]) && <span className="bubble-label">{b.label || BUBBLE_LABELS[b.role]}</span>}
            <span>{b.text}</span>
          </div>
        ))}

        {typing && (
          <div className={`bubble ${bubbles[revealed]?.role || "me"} typing`}>
            <span className="wave-bars">
              <span />
              <span />
              <span />
              <span />
            </span>
          </div>
        )}

        {!done && (
          <button
            type="button"
            className={`script-advance${typing ? "" : " tap-next"}`}
            onClick={revealNext}
            ref={advanceRef}
            disabled={typing}
          >
            Наступна репліка
            <span className="script-advance-ico">
              <ChevronIcon />
            </span>
          </button>
        )}
      </div>
    </>
  );
}

/* ===================== TIMELINE (кроки візиту / recap) ===================== */

export function TimelineScreen({ component, screenNumber, onGateProgress, onZoomImage }) {
  const { kicker, lead, images = [], steps = [], highlight } = component.content || {};
  // Набір відкритих індексів (не один) — раніше відкриття нового кроку
  // автоматично згортало попередній (одна змінна openIdx), і людина, що
  // гортає вниз по списку, бачила, як щойно прочитане ховається саме
  // собою. Тепер кожен крок вмикається/вимикається незалежно й лишається
  // відкритим, поки не тапнути по ньому ще раз.
  const [openSet, setOpenSet] = useState(() => new Set());
  const [everOpened, setEverOpened] = useState(() => new Set());

  // У режимі "ви тут" гейт зараховує лише підсвічений крок — решта
  // відкриваються вільно, але не вимагаються (recap-екрани в legacy).
  const highlightIdx = highlight ? Number(highlight) - 1 : null;

  useEffect(() => {
    if (highlightIdx != null) onGateProgress?.(everOpened.has(highlightIdx) ? 1 : 0);
    else onGateProgress?.(everOpened.size);
  }, [everOpened, highlightIdx, onGateProgress]);

  function toggle(i) {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    setEverOpened((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{component.title}</h2>}
      {lead && <p className="cp-lead">{lead}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />
      <div className="timeline">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`tl-item${openSet.has(i) ? " open" : ""}${everOpened.has(i) ? " seen" : ""}${
              highlightIdx === i ? " current" : ""
            }`}
          >
            {/* Рейка зліва — номер-кружечок + сполучна лінія до наступного
                кроку, щоб читалось як один ланцюжок, а не набір окремих
                карток. Лінія лишається сірою, поки крок НЕ відкрито —
                зафарбовується услід за самим кружечком (клас .seen),
                показуючи пройдений відрізок ланцюга. */}
            <div className="tl-rail" aria-hidden="true">
              <span className="tl-num">{i + 1}</span>
              {i < steps.length - 1 && <span className="tl-line" />}
            </div>
            <div className="tl-body">
              <button type="button" className="tl-head" onClick={() => toggle(i)} aria-expanded={openSet.has(i)}>
                <span className="tl-title">{step.title || `Крок ${i + 1}`}</span>
              </button>
              {openSet.has(i) && step.detail && <div className="tl-detail">{step.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ===================== PHOTO (самостійне фото) ===================== */

export function PhotoScreen({ component, screenNumber, onZoomImage }) {
  const { images = [] } = component.content || {};
  return (
    <>
      {component.title && <h2 className="cp-h2">{component.title}</h2>}
      {images
        .filter((img) => img.url)
        .map((img, i) => {
          const alt = img.caption || component.title || "";
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
              <CourseImage src={img.url} alt={alt} />
              {img.caption && <div className="cp-photo-caption">{img.caption}</div>}
            </div>
          );
        })}
    </>
  );
}

/* ===================== INPUT (довільне текстове поле) ===================== */

/**
 * Гейт "щось введено" — саме значення НІКУДИ не зберігається (ні в БД, ні
 * навіть у стані плеєра вище за цей компонент), лишається тільки в
 * локальному useState на час, поки екран змонтовано. Повернувшись на цей
 * екран пізніше, поле знову порожнє — так і задумано, це не форма зі
 * збереженням відповіді, а спосіб "змусити задуматись" перед тим, як
 * пустити далі.
 */
export function InputScreen({ component, screenNumber, onGateProgress }) {
  const { kicker, label, placeholder, multiline } = component.content || {};
  const [value, setValue] = useState("");

  useEffect(() => {
    onGateProgress?.(value.trim() ? 1 : 0);
  }, [value, onGateProgress]);

  const Field = multiline ? "textarea" : "input";

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{component.title}</h2>}
      {label && <label className="cp-input-label">{label}</label>}
      <Field
        className="cp-input-field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder || ""}
        rows={multiline ? 4 : undefined}
      />
    </>
  );
}

/* ===================== STREAK TOAST (мотивація за серію) ===================== */

const CONFETTI_COLORS = ["#ffffff", "var(--gold)", "var(--green-300)"];

/**
 * Мотиваційний тост за серію правильних відповідей поспіль — банер, що
 * опускається зверху вниз у верхній частині екрана (CSS — .streak-toast*
 * у course-player.css), не в потоці контенту. Ефемерний: сам собою
 * ховається за таймером у components/CoursePlayer.jsx (тут лише візуал),
 * тому немає власного onClose — не заважає проходженню, просто зникає.
 */
export function StreakToast({ icon, title, sub }) {
  // 7 шматочків конфеті з випадковою позицією/затримкою — рахуємо один
  // раз при монтуванні (не на кожен рендер), інакше вони "стрибали" б.
  const [pieces] = useState(() =>
    Array.from({ length: 7 }, (_, i) => ({
      left: 6 + Math.random() * 88,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 160,
    }))
  );

  return (
    <div className="streak-toast-overlay" aria-hidden="true">
      <div className="streak-toast" role="status">
        <span className="streak-toast-icon" aria-hidden="true">
          {icon}
        </span>
        <div className="streak-toast-text">
          <b>{title}</b>
          <span>{sub}</span>
        </div>
        <div className="streak-toast-confetti" aria-hidden="true">
          {pieces.map((p, i) => (
            <span
              key={i}
              className="streak-confetti-piece"
              style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Конфеті на весь екран — для фінального екрана курсу, пройденого на
 * 100%. Той самий прийом, що й у StreakToast (CSS-анімація, без
 * бібліотеки й без canvas), але більше шматочків і на всю висоту вікна,
 * а не в межах банера.
 *
 * Позиції рахуються один раз при монтуванні: інакше кожен ререндер
 * батька (а він там є — статус збереження результату) пересував би
 * шматочки посеред польоту.
 *
 * aria-hidden: це чисто декоративний шар. Сам факт "курс складено на
 * 100%" озвучений текстом поруч, тож читачеві екрана конфеті не потрібне.
 */
export function ConfettiBurst({ pieces = 40 }) {
  const [items] = useState(() =>
    Array.from({ length: pieces }, (_, i) => ({
      left: Math.random() * 100,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 900,
      duration: 2200 + Math.random() * 1400,
      drift: Math.random() * 60 - 30,
      size: 6 + Math.random() * 6,
    }))
  );

  return (
    <div className="cp-confetti" aria-hidden="true">
      {items.map((p, i) => (
        <span
          key={i}
          className="cp-confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: p.color,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}ms`,
            "--drift": `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

/* ===================== HOTSPOT (гаряча точка на фото) ===================== */

/**
 * Знайти й натиснути потрібне місце на фото. Це ПИТАННЯ: результат іде в
 * бал нарівні з quiz, тому компонент повідомляє нагору onAnswer(boolean),
 * а не onGateProgress.
 *
 * Зони зберігаються у ВІДСОТКАХ від розміру зображення — те саме фото
 * показується і на телефоні, і на ноутбуці, піксельні координати там
 * розійшлися б. Влучанням вважається клік усередині будь-якої зони:
 * "покажи помилку на полиці" часто має кілька однаково правильних
 * відповідей.
 *
 * Фото навмисно НЕ відкривається в лайтбоксі, поки не відповіли: інакше
 * тап по зображенню означав би дві різні дії одночасно.
 */
export function HotspotScreen({ component, screenNumber, answer, onAnswer }) {
  const { kicker, lead, images = [], zones = [], explanation } = component.content || {};
  const [click, setClick] = useState(null);
  // Поки фото не завантажилось, натискати нікуди: людина ще не бачить, що
  // саме шукає, а координати рахувались би по порожньому скелетону — і
  // відповідь записалась би за картинку, якої вона не бачила.
  const [imgReady, setImgReady] = useState(false);
  const isAnswered = answer !== undefined;
  const image = images.find((img) => img.url);

  function handleClick(e) {
    if (isAnswered || !image || !imgReady) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // Фото ще не завантажилось (або блок прихований) — кадр нульового
    // розміру. Без цієї перевірки ділення дає NaN, влучання не
    // зараховується, і людині записується НЕПРАВИЛЬНА відповідь просто за
    // те, що вона натиснула раніше, ніж підвантажилась картинка. Нічого
    // не фіксуємо — хай натисне ще раз.
    if (!rect.width || !rect.height) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setClick({ x, y });
    // Сам розрахунок влучання — у lib/componentTypes.js (isHotspotHit),
    // щоб його можна було перевірити тестом: тут він жив би всередині
    // React-компонента, для якого в проєкті немає тестового середовища.
    onAnswer(isHotspotHit({ x, y }, zones, rect.height / rect.width));
  }

  if (!image) {
    return (
      <>
        <Kicker screenNumber={screenNumber} text={kicker} />
        {component.title && <h2 className="cp-h2">{component.title}</h2>}
        <p className="cp-lead">Для цього питання ще не додано фото.</p>
      </>
    );
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{component.title}</h2>}
      {lead && <p className="cp-lead">{lead}</p>}

      <div
        className={`hs-frame${isAnswered ? " answered" : ""}${imgReady ? "" : " loading"}`}
        onClick={handleClick}
        role={isAnswered ? undefined : "button"}
        tabIndex={isAnswered ? undefined : 0}
        aria-label={isAnswered ? undefined : "Натисніть потрібне місце на фото"}
      >
        <CourseImage src={image.url} alt={image.caption || component.title || ""} onLoaded={() => setImgReady(true)} />

        {/* Правильні зони показуємо ЛИШЕ після відповіді — інакше питання
            не мало б сенсу. */}
        {isAnswered &&
          zones.map((z, i) => (
            <span
              key={i}
              className="hs-zone"
              style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${(z.r || 8) * 2}%`, aspectRatio: "1" }}
            />
          ))}

        {click && (
          <span className={`hs-pin${answer ? " ok" : " bad"}`} style={{ left: `${click.x}%`, top: `${click.y}%` }} />
        )}
      </div>
      {image.caption && <div className="cp-photo-caption">{image.caption}</div>}

      {isAnswered && (
        <div className={`q-fb show ${answer ? "ok" : "bad"}`}>
          <b className="q-fb-verdict">{answer ? "Влучно!" : "Не те місце — правильне обведено зеленим."}</b>
          {explanation && <span className="q-fb-explain">{explanation}</span>}
        </div>
      )}
    </>
  );
}

/* ===================== IMAGE ZOOM (lightbox) ===================== */

/**
 * Зум фото по тапу — з legacy: на телефоні дрібні деталі на фото
 * (планограми, скріншоти Моноліту) інакше нечитабельні. Рендериться
 * поверх усього, закривається по фону/Esc/кнопці.
 */
export function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!src) return null;
  return (
    <div className="lightbox open show" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button type="button" className="lightbox-close" onClick={onClose} aria-label="Закрити">
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image тут
          зайвий: джерело вже завантажене й показане на екрані нижче, це та
          сама картинка "у повний розмір", без окремого раунду оптимізації. */}
      <img src={src} alt={alt || ""} />
    </div>
  );
}
