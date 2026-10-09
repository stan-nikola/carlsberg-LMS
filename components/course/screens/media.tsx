"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import { ChevronIcon } from "@/components/ui/icons";
import { peekScrollTo } from "@/lib/scrollHints";
import { renderRichText, renderRichMarks } from "@/lib/richText";
import { parseVideoEmbed } from "@/lib/videoEmbed";
import { useDismiss } from "@/hooks/useDismiss";
import type { MediaItem, ZoomImage } from "@/components/course/screens/types";

/**
 * Інтерактивні компоненти екрана, портовані з попередньої vanilla-JS
 * розробки ("8 кроків телесейлінгу") + прості photo/input. Спільні для
 * плеєра (components/course/player/CoursePlayer.tsx) і живого прев'ю в /admin — щоб
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

/** Фото екрана в рамці. З onZoom — кнопка (клік, Enter, пробіл) відкриває
 *  його на весь екран; без нього — звичайна картинка. */
export function PhotoFrame({ src, alt, onZoom, children }: { src: string; alt: string; onZoom?: ZoomImage; children?: ReactNode }) {
  const zoom = onZoom ? () => onZoom({ src, alt }) : undefined;
  return (
    <div
      className={`photo-frame${zoom ? " zoomable" : ""}`}
      role={zoom ? "button" : undefined}
      tabIndex={zoom ? 0 : undefined}
      onClick={zoom}
      onKeyDown={
        zoom
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                zoom();
              }
            }
          : undefined
      }
    >
      <CourseImage src={src} alt={alt} zoomable={Boolean(zoom)} />
      {children}
    </div>
  );
}

export function CourseImage({ src, alt, onLoaded, zoomable = false }: { src: string; alt: string; onLoaded?: () => void; zoomable?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  // Реальні пропорції завантаженого фото — у CSS-змінну на обгортці:
  // десктопний reflow (course-player.css, @container cp-card) обмежує фото
  // по висоті (max-height) і має звузити коробку пропорційно, а не
  // залишити рамку на всю колонку з порожніми боками. aspect-ratio з
  // max-height у CSS робить саме це (transferred size), але сам ratio
  // знає лише браузер після завантаження — звідси змінна.
  const [aspect, setAspect] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

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
      style={aspect ? ({ "--img-aspect": aspect } as CSSProperties) : undefined}
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
export function NoteAccordion({ note }: { note: string }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
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

export function Kicker({ screenNumber, text }: { screenNumber?: number; text?: string }) {
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
export function ScreenMedia({ images, title, onZoomImage }: { images?: MediaItem[]; title?: string | null; onZoomImage?: ZoomImage }) {
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
          <PhotoFrame key={i} src={img.url} alt={alt} onZoom={zoomable ? onZoomImage : undefined}>
            {img.caption && <div className="cp-photo-caption">{renderRichMarks(img.caption)}</div>}
          </PhotoFrame>
        );
      })}
    </div>
  );
}

/* ===================== IMAGE ZOOM (lightbox) ===================== */

/**
 * Зум фото по тапу — з legacy: на телефоні дрібні деталі на фото
 * (планограми, скріншоти Моноліту) інакше нечитабельні. Рендериться
 * поверх усього, закривається по фону/Esc/кнопці.
 */
export function ImageLightbox({ src, alt, onClose }: { src?: string | null; alt?: string; onClose: () => void }) {
  useDismiss(onClose, Boolean(src));

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
