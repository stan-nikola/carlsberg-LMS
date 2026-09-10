"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronIcon, CheckIcon } from "@/components/icons";

/**
 * Інтерактивні екрани уроку, портовані з попередньої vanilla-JS розробки
 * ("8 кроків телесейлінгу"). Спільні для плеєра (components/CoursePlayer.jsx)
 * і живого прев'ю в /admin — щоб адміністратор бачив рівно те саме, що й
 * співробітник, а не окрему приблизну копію.
 *
 * Контракт у всіх однаковий:
 *   lesson        — { title, type, content }
 *   screenNumber  — номер екрана для kicker'а
 *   onGateProgress(doneCount) — скільки елементів уже "зроблено"; плеєр
 *                   сам вирішує, чи цього досить (lib/lessonTypes.js).
 * Стан взаємодії живе В КОМПОНЕНТІ (а не в плеєрі) навмисно: він
 * ефемерний, у БД не пишеться — при поверненні на екран людина бачить
 * уже відкриті картки, поки не перезавантажить курс.
 */

function Kicker({ screenNumber, text }) {
  if (!text) return null;
  return (
    <div className="cp-kicker">
      <span className="cp-kicker-num">{screenNumber}</span>
      <span>{text}</span>
    </div>
  );
}

/* ===================== ACCORDION ===================== */

export function AccordionScreen({ lesson, screenNumber, onGateProgress }) {
  const { kicker, lead, items = [] } = lesson.content || {};
  const [openIdx, setOpenIdx] = useState(null);
  // "Колись відкриті" — гейт зараховує сам факт відкриття, а не те, що
  // картка лишилась розгорнутою (як .ever-open у legacy).
  const [everOpened, setEverOpened] = useState(() => new Set());

  useEffect(() => {
    onGateProgress?.(everOpened.size);
  }, [everOpened, onGateProgress]);

  function toggle(i) {
    setOpenIdx((cur) => (cur === i ? null : i));
    setEverOpened((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
  }

  return (
    <div className="cp-screen">
      <Kicker screenNumber={screenNumber} text={kicker} />
      <h2 className="cp-h2">{lesson.title}</h2>
      {lead && <p className="cp-lead">{lead}</p>}
      <div className="acc-list">
        {items.map((item, i) => (
          <div key={i} className={`acc-item${openIdx === i ? " open" : ""}${everOpened.has(i) ? " seen" : ""}`}>
            <button type="button" className="acc-head" onClick={() => toggle(i)} aria-expanded={openIdx === i}>
              <span className="acc-title">{item.title || `Картка ${i + 1}`}</span>
              <span className="acc-chevron">
                <ChevronIcon />
              </span>
            </button>
            {openIdx === i && <div className="acc-body">{item.body}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===================== CHECKLIST ===================== */

export function ChecklistScreen({ lesson, screenNumber, onGateProgress }) {
  const { kicker, lead, items = [] } = lesson.content || {};
  const [checked, setChecked] = useState(() => new Set());

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
    <div className="cp-screen">
      <Kicker screenNumber={screenNumber} text={kicker} />
      <h2 className="cp-h2">{lesson.title}</h2>
      {lead && <p className="cp-lead">{lead}</p>}
      <div className="check-list">
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            className={`check-item${checked.has(i) ? " done" : ""}`}
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
    </div>
  );
}

/* ===================== SCRIPT (діалог дзвінка) ===================== */

const BUBBLE_LABELS = { me: "Ви кажете", client: "Клієнт", tip: "Порада", note: "" };

export function ScriptScreen({ lesson, screenNumber, onGateProgress }) {
  const { kicker, lead, callLabel, bubbles = [] } = lesson.content || {};
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
    <div className="cp-screen">
      <Kicker screenNumber={screenNumber} text={kicker} />
      <h2 className="cp-h2">{lesson.title}</h2>
      {lead && <p className="cp-lead">{lead}</p>}

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
          <button type="button" className="script-advance" onClick={revealNext} ref={advanceRef} disabled={typing}>
            Наступна репліка
            <span className="script-advance-ico">
              <ChevronIcon />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ===================== TIMELINE (кроки візиту / recap) ===================== */

export function TimelineScreen({ lesson, screenNumber, onGateProgress }) {
  const { kicker, lead, steps = [], highlight } = lesson.content || {};
  const [openIdx, setOpenIdx] = useState(null);
  const [everOpened, setEverOpened] = useState(() => new Set());

  // У режимі "ви тут" гейт зараховує лише підсвічений крок — решта
  // відкриваються вільно, але не вимагаються (recap-екрани в legacy).
  const highlightIdx = highlight ? Number(highlight) - 1 : null;

  useEffect(() => {
    if (highlightIdx != null) onGateProgress?.(everOpened.has(highlightIdx) ? 1 : 0);
    else onGateProgress?.(everOpened.size);
  }, [everOpened, highlightIdx, onGateProgress]);

  function toggle(i) {
    setOpenIdx((cur) => (cur === i ? null : i));
    setEverOpened((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
  }

  return (
    <div className="cp-screen">
      <Kicker screenNumber={screenNumber} text={kicker} />
      <h2 className="cp-h2">{lesson.title}</h2>
      {lead && <p className="cp-lead">{lead}</p>}
      <div className="timeline">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`tl-item${openIdx === i ? " open" : ""}${everOpened.has(i) ? " seen" : ""}${
              highlightIdx === i ? " current" : ""
            }`}
          >
            <button type="button" className="tl-head" onClick={() => toggle(i)} aria-expanded={openIdx === i}>
              <span className="tl-num">{i + 1}</span>
              <span className="tl-title">{step.title || `Крок ${i + 1}`}</span>
            </button>
            {openIdx === i && step.detail && <div className="tl-detail">{step.detail}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===================== STREAK TOAST (мотивація за серію) ===================== */

const CONFETTI_COLORS = ["#ffffff", "var(--gold)", "var(--green-300)"];

/**
 * Мотиваційний тост за серію правильних відповідей поспіль — з конфеті,
 * портовано з legacy showStreakToast. Ефемерний: сам собою ховається за
 * таймером у components/CoursePlayer.jsx (тут лише візуал), тому немає
 * власного onClose — не заважає проходженню, просто зникає.
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
    <div className="streak-toast show" role="status">
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
