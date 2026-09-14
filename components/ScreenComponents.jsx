"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronIcon, CheckIcon } from "@/components/icons";
import { isHotspotHit } from "@/lib/componentTypes";
import { peekScrollTo, scrollToEnd } from "@/lib/scrollHints";
import { nextTimelineTarget } from "@/lib/coursePlayerLogic";

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
/** Значок «збільшити» на фото — живе всередині .cp-img-wrap, тобто
 * завжди в куті САМОГО фото, а не рамки (на десктопі рамка ширша за
 * звужене фото). */
export function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <line x1="21" y1="21" x2="15.5" y2="15.5" />
    </svg>
  );
}

export function CourseImage({ src, alt, onLoaded, zoomable = false }) {
  const [loaded, setLoaded] = useState(false);
  // Реальні пропорції завантаженого фото — у CSS-змінну на обгортці:
  // десктопний reflow (course-player.css, @container cp-card) обмежує фото
  // по висоті (max-height) і має звузити коробку пропорційно, а не
  // залишити рамку на всю колонку з порожніми боками. aspect-ratio з
  // max-height у CSS робить саме це (transferred size), але сам ratio
  // знає лише браузер після завантаження — звідси змінна.
  const [aspect, setAspect] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    // Слухаємо нативний `load` самого <img>, а не лише onLoad від
    // next/image: той викликає наш колбек тільки ПІСЛЯ `img.decode()`, а
    // decode() у Chrome для фото в прев'ю /admin (.adm-shell зі zoom:85%)
    // просто ніколи не завершується — картинка вже complete, naturalWidth
    // є, data-loaded-src Next виставив, а скелетон світиться вічно
    // (перевірено 2026-09-14). Нативна подія від decode() не залежить.
    // Плюс фото з кешу вже complete на першому рендері — для нього жодна
    // подія не прийде, тому окрема перевірка одразу.
    const img = wrapRef.current?.querySelector("img");
    if (!img) return undefined;
    const mark = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) setAspect(img.naturalWidth / img.naturalHeight);
      setLoaded(true);
      onLoaded?.();
    };
    if (img.complete && img.naturalWidth > 0) {
      mark();
      return undefined;
    }
    img.addEventListener("load", mark);
    img.addEventListener("error", mark);
    return () => {
      img.removeEventListener("load", mark);
      img.removeEventListener("error", mark);
    };
  }, [src, onLoaded]);

  return (
    <div
      ref={wrapRef}
      className={`cp-img-wrap${loaded ? " is-loaded" : ""}`}
      style={aspect ? { "--img-aspect": aspect } : undefined}
    >
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
      {/* Лупа — на КОЖНОМУ фото, яке відкривається в лайтбокс (раніше
          лише в інфо-блоці, і там її перекривав <img> із z-index:1). */}
      {zoomable && loaded && (
        <span className="zoom-badge" aria-hidden="true">
          <ZoomIcon />
        </span>
      )}
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
            <CourseImage src={img.url} alt={alt} zoomable={zoomable} />
            {img.caption && <div className="cp-photo-caption">{img.caption}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ===================== ACCORDION ===================== */

export function AccordionScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }) {
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
  // У методичці все відкрито з самого початку — підсвічувати нічого.
  const isOpen = (i) => readOnly || everOpened.has(i);
  const nextIdx = readOnly || !tapHint ? -1 : items.findIndex((_, i) => !everOpened.has(i));

  function toggle(i) {
    if (readOnly || everOpened.has(i)) return;
    setEverOpened((prev) => new Set(prev).add(i));
    // Підводимо картку, що йде ЗА цією, а не «першу невідкриту»: людина
    // читає згори вниз, і стрибок назад збивав би. peekScrollTo лишає
    // щойно відкритий текст на екрані — саме тому, що scrollIntoView
    // ховав його під верхній край.
    // keepVisible — сама відкрита картка: на десктопі список у два
    // стовпці, «наступна» стоїть у тому ж ряду, і без цього розкритий
    // текст обрізало нижнім краєм в'юпорта.
    // Остання картка: наступної нема — крутимо до самого низу, щоб було
    // видно і її текст, і те, що стоїть під списком (підказка гейта,
    // наступний компонент).
    const children = listRef.current?.children;
    const following = children?.[i + 1];
    const opened = children?.[i];
    requestAnimationFrame(() => (following ? peekScrollTo(following, { keepVisible: opened }) : scrollToEnd(opened)));
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{component.title}</h2>}
      {lead && <p className="cp-lead">{lead}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />
      <div className="acc-list" ref={listRef}>
        {items.map((item, i) => (
          <div key={i} className={`acc-item${isOpen(i) ? " open seen" : ""}`}>
            {/* У методичці заголовок — не кнопка: нічого не розгортати. */}
            {readOnly ? (
              <div className="acc-head acc-head--static">
                <span className="acc-title">{item.title || `Картка ${i + 1}`}</span>
              </div>
            ) : (
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
            )}
            {isOpen(i) && <div className="acc-body">{item.body}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

/* ===================== CHECKLIST ===================== */

export function ChecklistScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }) {
  const { kicker, lead, images = [], items = [] } = component.content || {};
  const [checked, setChecked] = useState(() => new Set());
  const nextIdx = readOnly || !tapHint ? -1 : items.findIndex((_, i) => !checked.has(i));

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
        {items.map((item, i) =>
          readOnly ? (
            // Методичка: статичний список з галочками, нічого не відмічати.
            <div key={i} className="check-item done check-item--static">
              <span className="check-box">
                <CheckIcon />
              </span>
              <span className="check-text">{item.text}</span>
            </div>
          ) : (
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
          )
        )}
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

export function ScriptScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }) {
  const { kicker, lead, images = [], callLabel, bubbles = [] } = component.content || {};
  // Методичка: увесь діалог видно одразу, без «друкує…» і таймера дзвінка.
  const [revealed, setRevealed] = useState(readOnly ? bubbles.length : 0);
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
    if (readOnly) return undefined;
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [readOnly]);

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
          {!readOnly && (
            <span className="call-time">
              {mm}:{ss}
            </span>
          )}
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
            className={`script-advance${typing || !tapHint ? "" : " tap-next"}`}
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

export function TimelineScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }) {
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

  const listRef = useRef(null);
  // Крок для переливу «тапни сюди»: без highlight — перший невідкритий,
  // з highlight — лише підсвічений (див. nextTimelineTarget, чому не
  // «перший невідкритий» в обох режимах).
  const nextIdx = readOnly || !tapHint ? -1 : nextTimelineTarget(steps.length, everOpened, highlightIdx);
  // Методичка: усі кроки розкриті, заголовки не клікаються.
  const isOpen = (i) => readOnly || openSet.has(i);

  function toggle(i) {
    if (readOnly) return;
    const opening = !openSet.has(i);
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    setEverOpened((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
    // Розкрили — підводимо наступний крок, а сам розкритий текст лишаємо на
    // екрані (keepVisible), як в акордеоні. Згортання екран не смикає.
    if (!opening) return;
    const children = listRef.current?.children;
    requestAnimationFrame(() => peekScrollTo(children?.[i + 1], { keepVisible: children?.[i] }));
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{component.title}</h2>}
      {lead && <p className="cp-lead">{lead}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />
      <div className="timeline" ref={listRef}>
        {steps.map((step, i) => (
          <div
            key={i}
            className={`tl-item${isOpen(i) ? " open" : ""}${readOnly || everOpened.has(i) ? " seen" : ""}${
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
              {readOnly ? (
                <div className="tl-head tl-head--static">
                  <span className="tl-title">{step.title || `Крок ${i + 1}`}</span>
                </div>
              ) : (
                <button
                  type="button"
                  className={`tl-head${i === nextIdx ? " tap-next" : ""}`}
                  onClick={() => toggle(i)}
                  aria-expanded={openSet.has(i)}
                >
                  <span className="tl-title">{step.title || `Крок ${i + 1}`}</span>
                </button>
              )}
              {isOpen(i) && step.detail && <div className="tl-detail">{step.detail}</div>}
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
