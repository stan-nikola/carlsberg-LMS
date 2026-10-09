"use client";

import { useEffect, useRef, useState } from "react";
import { peekScrollTo } from "@/lib/scrollHints";
import { renderRichMarks } from "@/lib/richText";
import { CourseImage, Kicker } from "@/components/course/screens/media";
import { EMPTY_CONTENT, type ScreenProps } from "@/components/course/screens/types";

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
export function ImagePinsScreen({ component, screenNumber, onGateProgress, onZoomImage, readOnly = false, tapHint = true }: ScreenProps) {
  const { kicker, lead, images = [], pins = [], pinShape, pinSize } = component.content || EMPTY_CONTENT;
  const [opened, setOpened] = useState(() => new Set<number>());
  // Точка, натиснута ОСТАННЬОЮ — окремо від набору вже прочитаних:
  // підпис біля самої точки показується лише в неї, а список записів
  // нижче тримає всі відкриті.
  const [active, setActive] = useState<number | null>(null);
  const image = images.find((img) => img.url);

  useEffect(() => {
    onGateProgress?.(readOnly ? pins.length : opened.size);
  }, [opened, pins.length, readOnly, onGateProgress]);

  const layoutRef = useRef<HTMLDivElement>(null);

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

  const isOpen = (i: number) => readOnly || opened.has(i);
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
