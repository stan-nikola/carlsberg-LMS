"use client";

import { useRef, useState } from "react";
import { HANDLES, boxFromDrag, moveBox, resizeBox, tapBox, toBox, zoneShapeClass, zoneStyle } from "@/lib/hotspotZones";
import type { BoxZone, Handle, HotspotShape, HotspotZone, Point } from "@/lib/hotspotZones";
import { RichTextArea, ScreenHeaderFields, fieldSetter } from "@/components/course-editor/fields/common";
import type { Content, FieldProps, MediaItem } from "@/components/course-editor/types";

type ZoneDrag =
  | { mode: "resize"; handle: Handle; origin: BoxZone }
  | { mode: "move"; start: Point; origin: BoxZone; index: number }
  | { mode: "draw"; start: Point; aspect: number; moved: boolean };

type Pin = { x: number; y: number; title: string; text: string };

/** Поле "довільний ввід" — лише підпис/плейсхолдер, значення ніде не
 * зберігається (гейт "щось введено", перевіряється в плеєрі). */
const HOTSPOT_SHAPES: { value: HotspotShape; label: string; title: string }[] = [
  { value: "rect", label: "Прямокутник", title: "Прямокутник або квадрат — обвести полицю, цінник, half кадру" },
  { value: "ellipse", label: "Овал", title: "Овал або коло — обвести пляшку, кегу, логотип" },
];

/**
 * Гаряча точка на фото. Зона малюється ПРОТЯЖКОЮ прямо по зображенню, як
 * у будь-якому графічному редакторі (той самий жест, що в Storyline і
 * H5P): протягнув — з'явилась рамка, потягнув за кут — змінив розмір, за
 * середину — посунув. Форма рамки ("прямокутник" чи "овал") дає всі
 * чотири потрібні фігури, включно з квадратом і колом.
 *
 * Жести — на Pointer Events, тобто однакові для миші й пальця; touch-action
 * на канві вимкнено, інакше протяжка гортала б сторінку замість малювання.
 * Просто тап (без руху) ставить зону типового розміру — щоб не змушувати
 * «малювати» там, де досить ткнути.
 *
 * Уся математика — lib/hotspotZones.ts (з тестами): нею ж плеєр показує
 * зони й зараховує влучання, тож розійтись вони не можуть.
 *
 * Координати й розміри — у ВІДСОТКАХ (ширина від ширини кадру, висота від
 * висоти): те саме фото показується на телефоні й на ноутбуці різного
 * розміру, піксельні значення там розійшлися б.
 */
export function HotspotFields({ content, onChange, onUploadingChange }: FieldProps) {
  const c: Content = { kicker: "", lead: "", explanation: "", ...content, images: content.images || [], zones: content.zones || [] };
  const set = fieldSetter(c, onChange);
  const [shape, setShape] = useState<HotspotShape>("rect");
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<BoxZone | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<ZoneDrag | null>(null);
  const zones: HotspotZone[] = c.zones;
  const image = c.images.find((img: MediaItem) => img.url);

  /** Точка події у відсотках кадру + пропорції самого кадру. */
  function readPointer(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      at: { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 },
      aspect: rect.height / rect.width,
    };
  }

  const replaceZone = (index: number, zone: HotspotZone) => set("zones")(zones.map((z, i) => (i === index ? zone : z)));

  function onPointerDown(e: React.PointerEvent) {
    if (e.button > 0) return;
    const read = readPointer(e);
    if (!read) return;
    const target = e.target as HTMLElement;
    const handle = target.dataset?.handle as Handle | undefined;
    const zoneAttr = target.closest<HTMLElement>("[data-zone]")?.dataset?.zone;
    canvasRef.current!.setPointerCapture(e.pointerId);

    if (handle && selected != null) {
      // Стару круглу зону переводимо в рамку рівно в мить, коли автор сам
      // узявся її правити — мовчазної масової міграції не робимо.
      dragRef.current = { mode: "resize", handle, origin: toBox(zones[selected], read.aspect) };
    } else if (zoneAttr != null) {
      const index = Number(zoneAttr);
      setSelected(index);
      dragRef.current = { mode: "move", start: read.at, origin: toBox(zones[index], read.aspect), index };
    } else {
      setSelected(null);
      dragRef.current = { mode: "draw", start: read.at, aspect: read.aspect, moved: false };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const read = readPointer(e);
    if (!read) return;
    if (drag.mode === "draw") {
      // Поріг у 1%: інакше звичайний тап тремтячою рукою малював би
      // зону-ниточку замість зони типового розміру.
      drag.moved = drag.moved || Math.abs(read.at.x - drag.start.x) > 1 || Math.abs(read.at.y - drag.start.y) > 1;
      if (drag.moved) setDraft(boxFromDrag(drag.start, read.at, shape));
    } else if (drag.mode === "move") {
      replaceZone(drag.index, moveBox(drag.origin, read.at.x - drag.start.x, read.at.y - drag.start.y));
    } else if (drag.mode === "resize" && selected != null) {
      replaceZone(selected, resizeBox(drag.origin, drag.handle, read.at));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraft(null);
    if (drag?.mode !== "draw") return;
    const read = readPointer(e);
    if (!read) return;
    const zone = drag.moved ? boxFromDrag(drag.start, read.at, shape) : tapBox(drag.start, shape, drag.aspect);
    set("zones")([...c.zones, zone]);
    setSelected(c.zones.length);
  }

  /** Перемикач форми правит і ОБРАНУ зону, і задає форму для наступних. */
  function chooseShape(value: HotspotShape) {
    setShape(value);
    if (selected == null || !zones[selected]) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const aspect = rect?.width ? rect.height / rect.width : 1;
    replaceZone(selected, { ...toBox(zones[selected], aspect), shape: value });
  }

  return (
    <>
      {/* РІВНО одне фото на питання — як у H5P Find the Hotspot і в
          хотспоті Storyline. Друге зображення тут було мертвим вантажем:
          зони ставились лише по першому, і плеєр теж показував лише його,
          тобто автор витрачав час на фото, якого ніхто не побачить
          (скарга користувача 2026-09-23). Потрібно два таких питання —
          це два блоки «гаряча точка», і їх можна покласти на ОДИН екран,
          другий екран заводити не треба. */}
      <ScreenHeaderFields
        c={c}
        set={set}
        onUploadingChange={onUploadingChange}
        maxImages={1}
        imagesLimitHint="Одне фото на питання: зони ставляться саме по ньому. Потрібне друге фото — додайте ще один блок «гаряча точка» на цей самий екран."
      />
      <div className="admin-field">
        <label className="admin-label">
          Правильні зони{" "}
          <span className="admin-hint">— проведіть по фото, щоб обвести місце; влучанням вважається будь-яка зона</span>
        </label>
        {!image ? (
          <p className="admin-hint">Спочатку додайте фото вище — зони малюються прямо по ньому.</p>
        ) : (
          <>
            <div className="admin-row adm-hotspot-tools">
              <span className="admin-hint">Форма:</span>
              {HOTSPOT_SHAPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`adm-hotspot-shape${shape === s.value ? " is-on" : ""}`}
                  onClick={() => chooseShape(s.value)}
                  title={s.title}
                  aria-pressed={shape === s.value}
                >
                  <span className={`adm-hotspot-shape-ico is-${s.value}`} aria-hidden="true" />
                  {s.label}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button
                type="button"
                className="admin-btn-link"
                onClick={() => {
                  set("zones")(zones.filter((_, i) => i !== selected));
                  setSelected(null);
                }}
                disabled={selected == null}
              >
                Видалити обрану
              </button>
              <button
                type="button"
                className="admin-btn-link"
                onClick={() => {
                  set("zones")([]);
                  setSelected(null);
                }}
                disabled={c.zones.length === 0}
              >
                Очистити зони
              </button>
            </div>
            {/* Звичайний <img>, а не next/image: тут важлива рівно та
                геометрія, по якій рахуються відсоткові координати, без
                будь-якого ресайзу під капотом. */}
            <div
              ref={canvasRef}
              className="adm-hotspot-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              role="presentation"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" draggable={false} />
              {zones.map((z, i) => (
                <span
                  key={i}
                  data-zone={i}
                  className={`adm-hotspot-zone ${zoneShapeClass(z)}${selected === i ? " is-selected" : ""}`}
                  style={zoneStyle(z)}
                >
                  <b className="adm-hotspot-num">{i + 1}</b>
                  {selected === i &&
                    HANDLES.map((h) => <i key={h} data-handle={h} className={`adm-hotspot-handle is-${h}`} />)}
                </span>
              ))}
              {draft && (
                <span
                  className={`adm-hotspot-zone is-draft ${draft.shape === "rect" ? "is-rect" : "is-ellipse"}`}
                  style={zoneStyle(draft)}
                />
              )}
            </div>
            <p className="admin-hint">
              {c.zones.length === 0
                ? "Жодної зони — питання поки не має правильної відповіді."
                : `Зон: ${c.zones.length}. Натисніть на зону, щоб обрати: далі її можна посунути або потягнути за кут.`}
            </p>
          </>
        )}
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Пояснення до відповіді <span className="admin-hint">— показується ПІСЛЯ відповіді, і правильної теж</span>
        </label>
        <RichTextArea
          value={c.explanation}
          onChange={set("explanation")}
          rows={2}
          paragraphs={false}
          placeholder="Чому саме це місце — коротко"
        />
      </div>
    </>
  );
}

/**
 * «Фото з точками» — пояснялка, не питання. Точка ставиться тапом прямо
 * по фото (як зони hotspot), підпис до неї — у списку нижче: поле для
 * тексту поверх самого знімка перекривало б те, що автор пояснює.
 *
 * Номер точки в списку збігається з номером на фото, тож зіставляти
 * «третій рядок — третя точка» не треба; обрана точка підсвічується з
 * обох боків одразу.
 */
export function ImagePinsFields({ content, onChange, onUploadingChange }: FieldProps) {
  const c: Content = {
    kicker: "",
    lead: "",
    pinShape: "circle",
    pinSize: 8,
    ...content,
    images: content.images || [],
    pins: content.pins || [],
  };
  const set = fieldSetter(c, onChange);
  const [selected, setSelected] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ index: number; moved: boolean } | null>(null);
  // Чи щойно тягнули точку: браузер шле click ПІСЛЯ pointerup, і без цього
  // прапорця перетягування закінчувалось би появою зайвої точки під пальцем.
  const justDraggedRef = useRef(false);
  const pins: Pin[] = c.pins;
  const image = c.images.find((img: MediaItem) => img.url);
  const setPin = (i: number, field: keyof Pin, value: Pin[keyof Pin]) =>
    set("pins")(pins.map((p, j) => (j === i ? { ...p, [field]: value } : p)));

  /** Координати події у відсотках кадру, обрізані по його межах. */
  function pctFromEvent(e: React.PointerEvent | React.MouseEvent): Point | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    return {
      x: Number(clamp(((e.clientX - rect.left) / rect.width) * 100).toFixed(1)),
      y: Number(clamp(((e.clientY - rect.top) / rect.height) * 100).toFixed(1)),
    };
  }

  function addPin(at?: Point) {
    // Нова точка зі списку (кнопкою) стає не рівно в центр, а сходинкою:
    // інакше друга й третя лягли б одна на одну, і автор бачив би лише
    // верхню.
    const step = (pins.length % 5) * 6;
    set("pins")([...pins, { x: at?.x ?? 42 + step, y: at?.y ?? 42 + step, title: "", text: "" }]);
    setSelected(pins.length);
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    const idx = (e.target as HTMLElement).dataset?.pin;
    if (idx == null) return;
    // Тягнемо точку — клік по фото (додати нову) при цьому не спрацює:
    // його гасить перевірка dragRef у onCanvasClick.
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    dragRef.current = { index: Number(idx), moved: false };
    setSelected(Number(idx));
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const at = pctFromEvent(e);
    if (!at) return;
    drag.moved = true;
    set("pins")(pins.map((p, j) => (j === drag.index ? { ...p, x: at.x, y: at.y } : p)));
  }

  function onCanvasPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    // Прапорець живе до наступного кліку: браузер шле click ПІСЛЯ
    // pointerup, і без цього перетягування закінчувалось би ще й появою
    // зайвої точки під пальцем.
    justDraggedRef.current = Boolean(drag?.moved);
  }

  function onCanvasClick(e: React.MouseEvent) {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    if ((e.target as HTMLElement).dataset?.pin != null) return;
    const at = pctFromEvent(e);
    if (at) addPin(at);
  }

  return (
    <>
      <ScreenHeaderFields
        c={c}
        set={set}
        onUploadingChange={onUploadingChange}
        maxImages={1}
        imagesLimitHint="Одне фото на екран: точки ставляться саме по ньому."
      />
      <div className="admin-field">
        <label className="admin-label">
          Точки на фото <span className="admin-hint">— натисніть по фото, щоб додати; «Далі» відкриється, коли співробітник відкриє ВСІ</span>
        </label>
        {!image ? (
          <p className="admin-hint">Спочатку додайте фото вище — точки ставляться прямо по ньому.</p>
        ) : (
          <>
            {/* Форма й розмір — над самим фото, щоб зміну було видно
                одразу на всіх маркерах (рішення користувача 2026-09-23:
                головне, щоб на знімку вони були ОДНАКОВІ, тож налаштування
                одне на компонент, а не в кожної точки). */}
            <div className="admin-row adm-hotspot-tools">
              <span className="admin-hint">Маркер:</span>
              {[
                { value: "circle", label: "Коло" },
                { value: "square", label: "Квадрат" },
              ].map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`adm-hotspot-shape${c.pinShape === s.value ? " is-on" : ""}`}
                  onClick={() => set("pinShape")(s.value)}
                  aria-pressed={c.pinShape === s.value}
                >
                  <span className={`adm-hotspot-shape-ico is-${s.value === "circle" ? "ellipse" : "rect"}`} aria-hidden="true" />
                  {s.label}
                </button>
              ))}
              <label className="admin-hint adm-pin-size">
                Розмір
                <input
                  type="range"
                  min="4"
                  max="30"
                  step="1"
                  value={c.pinSize}
                  onChange={(e) => set("pinSize")(Number(e.target.value))}
                  aria-label="Розмір маркера, % ширини фото"
                />
                <b>{c.pinSize}%</b>
              </label>
            </div>
            <div
              ref={canvasRef}
              className="adm-hotspot-canvas"
              onClick={onCanvasClick}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerCancel={onCanvasPointerUp}
              role="presentation"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" draggable={false} />
              {pins.map((pin, i) => (
                <span
                  key={i}
                  data-pin={i}
                  className={`adm-pin is-${c.pinShape === "square" ? "square" : "circle"}${selected === i ? " is-selected" : ""}`}
                  style={{ left: `${pin.x}%`, top: `${pin.y}%`, width: `${c.pinSize}%` }}
                  title="Перетягніть, щоб пересунути"
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <p className="admin-hint">Натисніть по фото, щоб додати точку, або перетягніть наявну на нове місце.</p>
            {c.pins.length === 0 ? (
              <p className="admin-hint">Жодної точки — екран поки нічого не пояснює.</p>
            ) : (
              pins.map((pin, i) => (
                <div
                  className={`admin-lesson-card${selected === i ? " is-selected" : ""}`}
                  key={i}
                  onFocusCapture={() => setSelected(i)}
                >
                  <div className="admin-row">
                    <span className="admin-hint" style={{ minWidth: 18 }}>
                      {i + 1}
                    </span>
                    <input
                      value={pin.title || ""}
                      onChange={(e) => setPin(i, "title", e.target.value)}
                      placeholder={`Заголовок точки ${i + 1}`}
                      className="admin-input-flex admin-title-input"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        set("pins")(pins.filter((_, j) => j !== i));
                        setSelected(null);
                      }}
                      className="admin-icon-btn"
                      aria-label="Видалити точку"
                      title="Видалити цю точку"
                    >
                      ✕
                    </button>
                  </div>
                  <RichTextArea
                    value={pin.text}
                    onChange={(v) => setPin(i, "text", v)}
                    rows={2}
                    paragraphs={false}
                    placeholder="Що тут пояснюємо"
                  />
                </div>
              ))
            )}
            {/* Кнопка внизу списку, як і в решти списків конструктора: тап
                по фото лишається, але його треба спершу здогадатись —
                кнопка ж просто є (прохання користувача 2026-09-23).
                Нова точка з'являється в кадрі, далі її перетягують. */}
            <button type="button" onClick={() => addPin()} className="admin-btn-link" title="Додати ще одну точку на фото">
              + Додати точку
            </button>
          </>
        )}
      </div>
    </>
  );
}
