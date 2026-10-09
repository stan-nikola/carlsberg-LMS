"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronIcon } from "@/components/ui/icons";
import { peekScrollTo } from "@/lib/scrollHints";
import { renderRichMarks } from "@/lib/richText";
import { Kicker, ScreenMedia } from "@/components/course/screens/media";
import { EMPTY_CONTENT, type ContentItem, type ScreenProps } from "@/components/course/screens/types";

/* ===================== SCRIPT (діалог дзвінка) ===================== */

// Підпис за замовчуванням для ролі. Перебивається власним b.label із
// конструктора (для співрозмовника, якого немає в списку ролей).
// "note" навмисно без підпису — це ремарка, а не чиясь репліка.
/**
 * Ім'я голосу: власний підпис репліки з конструктора, інакше стандартний
 * для ролі. Рішення користувача 2026-09-23 — «кружок з першою літерою
 * імені, яке вказали кастомно або зі списку за замовчуванням».
 */
function speakerName(bubble: ContentItem | undefined) {
  if (!bubble) return "";
  return (bubble.label || "").trim() || BUBBLE_LABELS[bubble.role as keyof typeof BUBBLE_LABELS] || "";
}

/** Літера для кружечка-аватара. Порожньому імені — крапка, щоб кружечок
 *  не виглядав зламаним. */
function speakerInitial(name: string) {
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

export function ScriptScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }: ScreenProps) {
  const { kicker, lead, images = [], callLabel, bubbles = [] } = component.content || EMPTY_CONTENT;
  // Методичка: увесь діалог видно одразу, без «друкує…» і таймера дзвінка.
  const [revealed, setRevealed] = useState(readOnly ? bubbles.length : 0);
  const [typing, setTyping] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const advanceRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
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
      // разом із підказкою, що екран дочитано. НЕ scrollToEnd(): той
      // крутить .cp-viewport до самого кінця — якщо на цьому ж екрані
      // після діалогу стоїть ще один компонент (напр. тест-питання,
      // стек кількох Component на одному Screen), різко перескакувало
      // повз кінець самого діалогу одразу до питань унизу (скарга
      // користувача, 2026-09-28: "скролит сильно в низ… к вопросам").
      // peekScrollTo із keepVisible показує саме НИЗ ДІАЛОГУ, той самий
      // прийом, що для кнопки "Наступна репліка" вище.
      peekScrollTo(null, { keepVisible: wrapRef.current, minShift: 4 });
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
