"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronIcon, CheckIcon, XIcon } from "@/components/icons";
import { isHotspotHit } from "@/lib/componentTypes";
import { peekScrollTo, scrollToEnd } from "@/lib/scrollHints";
import { nextTimelineTarget } from "@/lib/coursePlayerLogic";
import { renderRichText, renderRichMarks } from "@/lib/richText";
import { MorphRevealIcon } from "@/components/MorphRevealIcon";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { zoneShapeClass, zoneStyle } from "@/lib/hotspotZones";
import { parseVideoEmbed } from "@/lib/videoEmbed";

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
        // Без sizes при CSS-responsive картинці (style width:100%) браузер
        // сам вважає, що вона займе 100vw, і на широкому десктопі тягне
        // 2x-варіант навіть там, де .course-card реально вужчий (аудит
        // швидкодії, 2026-09-19; node_modules/next/dist/docs/.../image.md
        // "sizes should be used when… CSS is used to make the image
        // responsive"). 900px — той самий @media-поріг, на якому
        // .stage--course-player.course-card розтягується до
        // min(1400px,96vw) (app/globals.css) — картка ширша за 800px, але
        // сама картинка всередині з відступами, тож 800px (той самий
        // intrinsic width вище) — безпечна, не занижена оцінка.
        sizes="(min-width: 900px) 800px, 100vw"
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

/** "Підказка" (Component.content.info.note) — розгортається по кліку, а не
 * видима завжди: щоб не перевантажувати екран текстом одразу і трохи
 * заохотити самому подумати перед тим, як підглянути відповідь/деталь.
 * Живе тут, а не в плеєрі: її рендерять і InfoScreen, і PhotoScreen, а
 * імпорт із CoursePlayer сюди замкнув би коло (плеєр уже імпортує звідси). */
export function NoteAccordion({ note }) {
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
      {open && <div className="cp-note-body">{renderRichText(note)}</div>}
    </div>
  );
}

function Kicker({ screenNumber, text }) {
  if (!text) return null;
  return (
    <div className="cp-kicker">
      <span className="cp-kicker-num">{screenNumber}</span>
      <span>{renderRichMarks(text)}</span>
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
        // Відео — вбудований плеєр YouTube/Vimeo за посиланням
        // (lib/videoEmbed.ts). Лайтбокс до нього не чіпляємо: у плеєра є
        // власні контроли й свій повний екран, а тап по кадру має ставити
        // паузу, а не відкривати щось зверху.
        const embed = parseVideoEmbed(img.url);
        if (embed) {
          return (
            <div className="photo-frame" key={i}>
              <div className="cp-video-embed">
                <iframe
                  src={embed.src}
                  title={img.caption || title || embed.title}
                  // loading=lazy: на екрані може стояти кілька роликів, і
                  // без цього кожен тягне свій плеєр ще до того, як людина
                  // до нього догортала.
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              {img.caption && <div className="cp-photo-caption">{renderRichMarks(img.caption)}</div>}
            </div>
          );
        }
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
            {img.caption && <div className="cp-photo-caption">{renderRichMarks(img.caption)}</div>}
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
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />
      <div className="acc-list" ref={listRef}>
        {items.map((item, i) => (
          <div key={i} className={`acc-item${isOpen(i) ? " open seen" : ""}`}>
            {/* У методичці заголовок — не кнопка: нічого не розгортати. */}
            {readOnly ? (
              <div className="acc-head acc-head--static">
                <span className="acc-title">{renderRichMarks(item.title) || `Картка ${i + 1}`}</span>
              </div>
            ) : (
              <button
                type="button"
                className={`acc-head${i === nextIdx ? " tap-next" : ""}`}
                onClick={() => toggle(i)}
                aria-expanded={everOpened.has(i)}
              >
                <span className="acc-title">{renderRichMarks(item.title) || `Картка ${i + 1}`}</span>
                <span className="acc-chevron">
                  <ChevronIcon />
                </span>
              </button>
            )}
            {isOpen(i) && <div className="acc-body">{renderRichText(item.body)}</div>}
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
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />
      <div className="check-list">
        {items.map((item, i) =>
          readOnly ? (
            // Методичка: статичний список з галочками, нічого не відмічати.
            <div key={i} className="check-item done check-item--static">
              <span className="check-box">
                <CheckIcon />
              </span>
              <span className="check-text">{renderRichMarks(item.text)}</span>
            </div>
          ) : (
            <button
              key={i}
              type="button"
              className={`check-item${checked.has(i) ? " done" : ""}${i === nextIdx ? " tap-next" : ""}`}
              onClick={() => toggle(i)}
              aria-pressed={checked.has(i)}
            >
              {/* Галочка з'являється тим самим морфом, що й у варіантах
                  відповіді (components/CoursePlayer.jsx) — один почерк на
                  весь застосунок. Рендериться ЛИШЕ коли пункт відмічено:
                  MorphRevealIcon промальовується на монтуванні, тож
                  постійно присутня й лише пофарбована в прозоре іконка
                  (як було) анімації не дала б узагалі.
                  Без label — стан уже озвучено через aria-pressed самої
                  кнопки, друга озвучка була б дублем. */}
              <span className="check-box">
                {checked.has(i) && <MorphRevealIcon shape="check" size={14} strokeWidth={3} className="check-mark" />}
              </span>
              <span className="check-text">{renderRichMarks(item.text)}</span>
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
/**
 * Ім'я голосу: власний підпис репліки з конструктора, інакше стандартний
 * для ролі. Рішення користувача 2026-09-23 — «кружок з першою літерою
 * імені, яке вказали кастомно або зі списку за замовчуванням».
 */
function speakerName(bubble) {
  if (!bubble) return "";
  return (bubble.label || "").trim() || BUBBLE_LABELS[bubble.role] || "";
}

/** Літера для кружечка-аватара. Порожньому імені — крапка, щоб кружечок
 *  не виглядав зламаним. */
function speakerInitial(name) {
  return (name || "").trim().charAt(0).toUpperCase() || "·";
}

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
  const wrapRef = useRef(null);
  const timerRef = useRef(null);
  // Співрозмовник у шапці — перший НЕ власний голос діалогу (і не
  // «порада»/«ремарка», це вставки автора, а не учасники розмови).
  const partner =
    speakerName(bubbles.find((b) => b.role && b.role !== "me" && b.role !== "tip" && b.role !== "note")) || "Співрозмовник";

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

  /**
   * Після кожної нової репліки кнопка «Наступна репліка» має лишатись на
   * екрані — трохи вище нижнього краю (там, одразу під в'юпортом, стоїть
   * сіра смуга .navwrap із підказкою гейта й кнопкою «Далі»). Інакше
   * діалог доводиться догортувати руками після КОЖНОЇ репліки.
   *
   * Чому ефект, а не requestAnimationFrame одразу після setRevealed (як
   * було): на останній репліці кнопка ЗНИКАЄ, і в rAF ref міг вказувати
   * ще на неї або вже на null — залежно від того, чи встиг React
   * закомітити. Ефект гарантовано йде після коміту, тож розгалуження
   * «є кнопка / вже нема» завжди правильне.
   *
   * І чому не scrollIntoView({block:"nearest"}), що стояв тут раніше:
   * по-перше, "nearest" підводить елемент рівно до краю — кнопка
   * опинялась впритул до сірої смуги; по-друге, scrollIntoView крутить
   * УСІХ прокручуваних предків, тобто разом із в'юпортом плеєра смикав і
   * сторінку під ним (той самий дефект уже ловили в методичці). Наш
   * peekScrollTo знаходить саме .cp-viewport і скролить лише його.
   */
  useEffect(() => {
    if (readOnly || revealed === 0) return;
    if (advanceRef.current) {
      // minShift:4 — тут потрібна саме повна видимість кнопки: типова
      // мертва зона в 24px лишала б її зрізаною знизу.
      peekScrollTo(null, { keepVisible: advanceRef.current, minShift: 4 });
    } else {
      // Репліки скінчились, кнопки більше нема — показуємо низ діалогу
      // разом із підказкою, що екран дочитано.
      scrollToEnd(wrapRef.current);
    }
  }, [revealed, readOnly]);

  function revealNext() {
    if (typing || revealed >= bubbles.length) return;
    setTyping(true);
    // Пауза з індикатором "друкує" — саме вона робить діалог схожим на
    // живу розмову, а не на стіну тексту, що з'явилась миттєво.
    setTimeout(() => {
      setTyping(false);
      setRevealed((n) => n + 1);
    }, 620);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const done = revealed >= bubbles.length;

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />

      <div className="script-wrap" ref={wrapRef}>
        {/* Шапка чату замість колишньої смуги дзвінка: хто на тому боці —
            видно один раз згори, як у будь-якому месенджері, і підпис у
            кожній репліці стає зайвим. Співрозмовник — перша НЕ-власна
            репліка діалогу: саме з ким іде розмова. */}
        <div className="chat-head">
          <span className="chat-avatar" aria-hidden="true">
            {speakerInitial(partner)}
          </span>
          <span className="chat-head-txt">
            <b>{partner}</b>
            <span>{callLabel || "Дзвінок із клієнтом"}</span>
          </span>
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

        {bubbles.slice(0, revealed).map((b, i) => {
          const role = b.role || "me";
          const isAside = role === "tip" || role === "note";
          const name = speakerName(b);
          // Групування: аватар і ім'я — лише в ПЕРШОЇ репліки серії одного
          // голосу, як у месенджерах. Інакше поруч із трьома репліками
          // клієнта тричі висів би той самий кружечок з тією ж літерою.
          const prev = bubbles[i - 1];
          const startsGroup = !prev || (prev.role || "me") !== role || speakerName(prev) !== name;
          return (
            <div
              key={i}
              className={`chat-row ${isAside ? "aside" : role === "me" ? "mine" : "theirs"}${startsGroup ? " starts" : ""}`}
            >
              {!isAside && role !== "me" && (
                <span className="chat-avatar sm" aria-hidden="true">
                  {startsGroup ? speakerInitial(name) : ""}
                </span>
              )}
              <div className={`bubble ${role}`}>
                {!isAside && role !== "me" && startsGroup && name && <span className="bubble-label">{name}</span>}
                <span>{renderRichMarks(b.text)}</span>
              </div>
            </div>
          );
        })}

        {typing && (
          <div className={`chat-row ${(bubbles[revealed]?.role || "me") === "me" ? "mine" : "theirs"}`}>
            {(bubbles[revealed]?.role || "me") !== "me" && (
              <span className="chat-avatar sm" aria-hidden="true">
                {speakerInitial(speakerName(bubbles[revealed]))}
              </span>
            )}
            <div className={`bubble ${bubbles[revealed]?.role || "me"} typing`}>
              <span className="wave-bars">
                <span />
                <span />
                <span />
                <span />
              </span>
            </div>
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

/* ===================== ФОТО З ТОЧКАМИ (пояснялка) ===================== */

/**
 * Фото з пронумерованими точками: тап по точці розкриває її підпис.
 * Гейт — відкрити всі. Це НЕ питання: правильної відповіді немає, у бал
 * не йде (пор. HotspotScreen, де треба вгадати місце).
 *
 * Навіщо окремий тип, коли є акордеон: підпис прив'язаний до МІСЦЯ на
 * фото. «Ось тут кран, ось тут редуктор» списком під картинкою читається
 * як набір слів — людина все одно мусить сама зіставити текст із деталлю.
 * Тут зіставляти не треба, і саме тому цей тип є в кожному серйозному
 * авторському інструменті (H5P Image Hotspots, Storyline markers).
 *
 * Підпис показується поруч із точкою, а не в окремій панелі знизу: на
 * телефоні панель знизу відриває пояснення від деталі, про яку воно.
 * Відкрита точка лишається відкритою — як картки акордеона.
 */
export function ImagePinsScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }) {
  const { kicker, lead, images = [], pins = [], pinShape, pinSize } = component.content || {};
  const [opened, setOpened] = useState(() => new Set());
  // Точка, натиснута ОСТАННЬОЮ — окремо від набору вже прочитаних:
  // підпис біля самої точки показується лише в неї, а список записів
  // нижче тримає всі відкриті.
  const [active, setActive] = useState(null);
  const image = images.find((img) => img.url);

  useEffect(() => {
    onGateProgress?.(readOnly ? pins.length : opened.size);
  }, [opened, pins.length, readOnly, onGateProgress]);

  const layoutRef = useRef(null);

  /**
   * Щойно відкрита запись має бути на екрані. peekScrollTo з keepVisible
   * сам вирішує, чи треба щось робити: якщо низ запису вже видно, зсув
   * виходить нульовим і екран не смикається (рішення користувача
   * 2026-09-23 — «підʼїжджати, тільки якщо її не видно»). На десктопі
   * записи стоять збоку від фото й видимі одразу, тож там теж тихо.
   */
  useEffect(() => {
    if (readOnly || active == null) return undefined;
    const note = layoutRef.current?.querySelector(`[data-note="${active}"]`);
    if (!note) return undefined;
    // Невелика пауза, а не миттєвий скрол: записи розкриваються каскадом
    // при вході на екран, і якщо тапнути точку саме в цей момент, їхні
    // позиції ще їдуть. Раніше тут стояло 280мс — чекали, поки запис
    // дорозкриється; тепер вони відкриті одразу, тож вистачає 120мс, і
    // підʼїзд відчувається як відповідь на тап, а не як роздум.
    const t = setTimeout(() => peekScrollTo(null, { keepVisible: note }), 120);
    return () => clearTimeout(t);
  }, [active, readOnly]);

  const isOpen = (i) => readOnly || opened.has(i);
  const nextIdx = readOnly || !tapHint ? -1 : pins.findIndex((_, i) => !opened.has(i));

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}

      {!image ? (
        <p className="cp-lead">Для цього екрана ще не додано фото.</p>
      ) : (
        /* Один контейнер і на фото, і на записи — щоб розкладка була суто
           CSS-ною, без дублювання тексту в DOM. Телефон: колонка, фото
           зверху, записи під ним по порядку номерів. Десктоп (@container
           cp-card): три колонки, фото посередині, а кожна запис іде в ту
           саму половину кадру, у якій стоїть її точка. */
        <div className="pins-layout" ref={layoutRef}>
          <div className="pins-frame">
          <CourseImage
            src={image.url}
            alt={image.caption || component.title || ""}
            zoomable={typeof onZoomImage === "function"}
          />
          {pins.map((pin, i) => (
            <button
              key={i}
              type="button"
              className={`pin ${pinShape === "square" ? "is-square" : "is-circle"}${isOpen(i) ? " open" : ""}${
                active === i ? " is-active" : ""
              }${i === nextIdx ? " tap-next" : ""}`}
              // Ширина у ВІДСОТКАХ кадру + aspect-ratio:1 у CSS — маркер
              // лишається рівно круглим/квадратним на будь-якому екрані й
              // однаковим у всіх точок (розмір один на компонент).
              style={{ left: `${pin.x}%`, top: `${pin.y}%`, width: `${pinSize || 8}%` }}
              onClick={() => {
                if (readOnly) return;
                setOpened((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
                setActive((cur) => (cur === i ? null : i));
              }}
              aria-label={pin.title || `Точка ${i + 1}`}
            >
              <span className="pin-num">{i + 1}</span>
              {/* Підпис ЛИШАЄТЬСЯ біля точки після відкриття, а не зникає з
                  переходом до наступної (рішення користувача 2026-09-23):
                  так на фото поступово проступає вся карта підписів і не
                  треба тримати в голові, де що. Виглядають усі однаково —
                  яка з них зараз обрана, видно по підсвіченому запису. */}
              {isOpen(i) && pin.title && (
                <span className={`pin-chip${pin.x > 55 ? " to-left" : ""}`}>{renderRichMarks(pin.title)}</span>
              )}
            </button>
          ))}
          </div>

          {/* Записи НАКОПИЧУЮТЬСЯ: відкрита точка лишається в списку, тож
              під кінець видно весь розбір знімка й деталі можна порівняти
              між собою (рішення користувача 2026-09-23). Порядок — за
              номерами точок, а не за порядком натискань: список має
              читатись як опис, а не як історія кліків. */}
          {/* Усі підписи видно ОДРАЗУ (рішення користувача 2026-09-23 —
              «вони не закривають простір і добре виглядають»). Тап по точці
              тепер означає не «відкрий текст», а «знайди це місце на фото»:
              підпис виїжджає біля самої точки, її запис підсвічується, і до
              нього підʼїжджає екран. Гейт лишився — «Далі» відкриється, коли
              торкнулись кожної точки, інакше екран проклацали б не глянувши
              на знімок. */}
          {pins.map((pin, i) =>
            pin.title || pin.text ? (
              // Слот-обгортка тримає анімацію розкриття (і колонку на
              // десктопі), сама картка лишається зі своїми відступами:
              // анімувати висоту можна лише на гріді, а padding картки
              // інакше стирчав би навіть при нульовій висоті.
              <div
                key={`note-${i}`}
                className={`pin-note-slot side-${pin.x > 50 ? "right" : "left"}`}
                data-note={i}
                // Каскад: записи розкриваються одна за одною, а не всі
                // разом — так видно, що їх кілька, і око встигає за рухом.
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className={`pin-note-card${active === i ? " is-active" : ""}${opened.has(i) ? " is-seen" : ""}`}>
                  <span className="pin-note-num">{i + 1}</span>
                  <span className="pin-note-txt">
                    {pin.title && <b>{renderRichMarks(pin.title)}</b>}
                    {pin.text && <span>{renderRichMarks(pin.text)}</span>}
                  </span>
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
      {image?.caption && <div className="cp-photo-caption">{renderRichMarks(image.caption)}</div>}
    </>
  );
}

/* ===================== ДО / ПІСЛЯ ===================== */

/**
 * Два фото в одній рамці з перемикачем. Гейт — перемкнути хоча б раз.
 *
 * Чому перемикач, а не «шторка» з повзунком, як у багатьох галереях:
 * повзунок вимагає тягнути пальцем рівно по вузькій ручці, а тут
 * телефонний застосунок для польових умов — у проєкті вже є рішення не
 * робити механік на перетягуванні. Тап по кадру дає ту саму головну
 * цінність: обидва стани показуються В ОДНИХ І ТИХ САМИХ межах кадру,
 * тож око бачить різницю миттєво, не переносячи погляд між двома фото.
 */
export function BeforeAfterScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }) {
  const { kicker, lead, images = [], beforeLabel, afterLabel } = component.content || {};
  const valid = (images || []).filter((img) => img.url);
  const [showAfter, setShowAfter] = useState(readOnly);
  const [switched, setSwitched] = useState(readOnly);

  useEffect(() => {
    onGateProgress?.(switched ? 1 : 0);
  }, [switched, onGateProgress]);

  if (valid.length < 2) {
    return (
      <>
        <Kicker screenNumber={screenNumber} text={kicker} />
        {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
        <p className="cp-lead">Для цього екрана потрібні два фото — «до» і «після».</p>
      </>
    );
  }

  const labels = [beforeLabel || "Було", afterLabel || "Стало"];
  const shown = valid[showAfter ? 1 : 0];

  function toggle(next) {
    if (readOnly) return;
    setShowAfter(next);
    if (next) setSwitched(true);
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}

      <div className="ba-frame">
        {/* Обидва фото лежать одне на одному й лише міняють прозорість:
            так кадр не «стрибає» при перемиканні, навіть якщо знімки
            трохи різних пропорцій, і перехід виходить плавним. */}
        {valid.slice(0, 2).map((img, i) => (
          <div key={i} className={`ba-layer${(i === 1) === showAfter ? " is-on" : ""}`} aria-hidden={(i === 1) !== showAfter}>
            <CourseImage src={img.url} alt={img.caption || labels[i]} zoomable={typeof onZoomImage === "function"} />
          </div>
        ))}
        <span className={`ba-badge${showAfter ? " is-after" : ""}`}>{labels[showAfter ? 1 : 0]}</span>
      </div>

      {!readOnly && (
        <div className="ba-switch" role="group" aria-label="Порівняння">
          {labels.map((label, i) => (
            <button
              key={i}
              type="button"
              className={`ba-switch-btn${(i === 1) === showAfter ? " is-on" : ""}${!switched && i === 1 && tapHint ? " tap-next" : ""}`}
              onClick={() => toggle(i === 1)}
              aria-pressed={(i === 1) === showAfter}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {shown?.caption && <div className="cp-photo-caption">{renderRichMarks(shown.caption)}</div>}
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
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}
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
                  <span className="tl-title">{renderRichMarks(step.title) || `Крок ${i + 1}`}</span>
                </div>
              ) : (
                <button
                  type="button"
                  className={`tl-head${i === nextIdx ? " tap-next" : ""}`}
                  onClick={() => toggle(i)}
                  aria-expanded={openSet.has(i)}
                >
                  <span className="tl-title">{renderRichMarks(step.title) || `Крок ${i + 1}`}</span>
                </button>
              )}
              {/* Деталь крока рендериться ЗАВЖДИ, а розкривається класом:
                  умовний рендер не дає чого анімувати — елемент з'являється
                  вже на повну висоту, і крок «стрибає». Обгортка тримає
                  саму анімацію висоти, .tl-detail лишається зі своїми
                  відступами. */}
              {step.detail && (
                <div className={`tl-detail-wrap${isOpen(i) ? " open" : ""}`} aria-hidden={!isOpen(i)}>
                  <div className="tl-detail">{renderRichText(step.detail)}</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ===================== PHOTO (фото та відео) ===================== */

/**
 * Обгортка навколо медіа: рубрика, заголовок, вступний рядок, саме фото
 * чи ролик — і «Варто знати» під ним. Той самий набір полів і той самий
 * порядок, що в усіх решти типів екрана: фото без жодного тексту читалось
 * як загублений слайд, і автору доводилось заводити окремий інфо-екран
 * поруч, аби підписати, що саме показано.
 *
 * Розмітку медіа НЕ дублюємо — беремо спільний ScreenMedia: до цього тут
 * лежала власна копія рамки, і будь-яка зміна (лупа, відео, підпис)
 * мовчки проходила повз саме той екран, який і створений заради фото.
 */
export function PhotoScreen({ component, screenNumber, onZoomImage }) {
  const { kicker, lead, note, images = [] } = component.content || {};
  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}
      <ScreenMedia images={images} title={component.title} onZoomImage={onZoomImage} />
      {note && <NoteAccordion note={note} />}
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
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
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
/* Палітра конфеті фінального екрана — лише фірмові токени (tokens.css), у
   випадковому порядку на кожну частинку: глибокий і яскравий зелені,
   золото, жовтий alert, success, синій notification. */
const TREFOIL_CONFETTI_COLORS = [
  "var(--cb-primary)",
  "var(--cb-secondary)",
  "var(--cb-tertiary)",
  "var(--cb-alert)",
  "var(--cb-success)",
  "var(--cb-notification)",
];

/* Пропорції public/assets/brand/trefoil-solid-green.png (1532×1417) — та
 * сама константа, що в components/PlatformBrand.jsx. */
const TREFOIL_ASPECT = 1532 / 1417;

export function ConfettiBurst({ pieces = 40 }) {
  // Трилистки замість квадратиків (користувач, 2026-09-15) — саме логотип
  // платформи (маска з PNG у course-player.css, .cp-confetti-piece), колір
  // випадковий з фірмової палітри, оберт — випадковий кут 180–540°, повільно
  // й плавно разом із падінням (одна анімація, той самий easing). База
  // падіння 3.3s — підібрана користувачем на стенді (2026-09-15, друга ітерація після 4.1s).
  const [items] = useState(() =>
    Array.from({ length: pieces }, () => ({
      left: Math.random() * 100,
      color: TREFOIL_CONFETTI_COLORS[Math.floor(Math.random() * TREFOIL_CONFETTI_COLORS.length)],
      delay: Math.random() * 900,
      duration: 3300 + Math.random() * 1800,
      drift: Math.random() * 80 - 40,
      spin: Math.round((Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360)),
      size: 10 + Math.random() * 8,
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
            height: `${p.size / TREFOIL_ASPECT}px`,
            color: p.color,
            animationDelay: `${p.delay}ms`,
            animationDuration: `${p.duration}ms`,
            "--drift": `${p.drift}px`,
            "--spin": `${p.spin}deg`,
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
        {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
        <p className="cp-lead">Для цього питання ще не додано фото.</p>
      </>
    );
  }

  return (
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{renderRichMarks(component.title)}</h2>}
      {lead && <p className="cp-lead">{renderRichMarks(lead)}</p>}

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
        {/* solo — коли правильне місце ОДНЕ: тоді решту знімка можна
            приглушити, лишивши яскравою саму зону (CSS робить це величезною
            зовнішньою тінню, обрізаною рамкою кадру). При кількох зонах
            такий прийом не працює: тінь однієї зони приглушила б сусідню,
            тож там лишається просто підсвітка без затемнення. */}
        {isAnswered &&
          zones.map((z, i) => (
            <span
              key={i}
              className={`hs-zone ${zoneShapeClass(z)}${zones.length === 1 ? " solo" : ""}`}
              style={zoneStyle(z)}
            />
          ))}

        {click && (
          <span className={`hs-pin${answer ? " ok" : " bad"}`} style={{ left: `${click.x}%`, top: `${click.y}%` }} />
        )}
      </div>
      {image.caption && <div className="cp-photo-caption">{renderRichMarks(image.caption)}</div>}

      {isAnswered && (
        <div className={`q-fb show ${answer ? "ok" : "bad"}`}>
          <b className="q-fb-verdict">{answer ? "Влучно!" : "Не те місце — правильне обведено зеленим."}</b>
          {explanation && <span className="q-fb-explain">{renderRichMarks(explanation)}</span>}
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
  useBodyScrollLock(Boolean(src));
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
