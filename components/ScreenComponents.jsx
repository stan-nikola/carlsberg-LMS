"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronIcon, CheckIcon } from "@/components/icons";

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

export function AccordionScreen({ component, screenNumber, onGateProgress }) {
  const { kicker, lead, items = [] } = component.content || {};
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
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{component.title}</h2>}
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
    </>
  );
}

/* ===================== CHECKLIST ===================== */

export function ChecklistScreen({ component, screenNumber, onGateProgress }) {
  const { kicker, lead, items = [] } = component.content || {};
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
    <>
      <Kicker screenNumber={screenNumber} text={kicker} />
      {component.title && <h2 className="cp-h2">{component.title}</h2>}
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
    </>
  );
}

/* ===================== SCRIPT (діалог дзвінка) ===================== */

const BUBBLE_LABELS = { me: "Ви кажете", client: "Клієнт", tip: "Порада", note: "" };

export function ScriptScreen({ component, screenNumber, onGateProgress }) {
  const { kicker, lead, callLabel, bubbles = [] } = component.content || {};
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
    </>
  );
}

/* ===================== TIMELINE (кроки візиту / recap) ===================== */

export function TimelineScreen({ component, screenNumber, onGateProgress }) {
  const { kicker, lead, steps = [], highlight } = component.content || {};
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
              <Image src={img.url} alt={alt} width={800} height={500} style={{ width: "100%", height: "auto" }} />
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
