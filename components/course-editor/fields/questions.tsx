"use client";

import { GripIcon } from "@/components/ui/icons";
import { HintDot } from "@/components/ui/HintDot";
import { useDragReorder } from "@/hooks/useDragReorder";
import { ImageListEditor } from "@/components/course-editor/media";
import { RichTextArea, ScreenHeaderFields, fieldSetter } from "@/components/course-editor/fields/common";
import type { Content, FieldProps, MediaItem } from "@/components/course-editor/types";

type OrderItem = { text: string };
type MatchPair = { left: string; right: string };

/**
 * «До / після» — рівно два фото: перше «до», друге «після». Порядок
 * задають ті самі стрілки, що й у будь-якому списку фото, тому окремих
 * полів «оберіть фото до» тут немає.
 */
export function BeforeAfterFields({ content, onChange, onUploadingChange }: FieldProps) {
  const c: Content = { kicker: "", lead: "", beforeLabel: "Було", afterLabel: "Стало", ...content, images: content.images || [] };
  const set = fieldSetter(c, onChange);
  const ready = c.images.filter((img: MediaItem) => img.url).length >= 2;

  return (
    <>
      <ScreenHeaderFields
        c={c}
        set={set}
        onUploadingChange={onUploadingChange}
        maxImages={2}
        imagesLimitHint="Два фото: перше — «до», друге — «після». Порядок міняють стрілки."
      />
      <div className="admin-field">
        <label className="admin-label">
          Підписи станів{" "}
          <HintDot
            align="start"
            text="Те, що написано на перемикачі й на плашці поверх фото. Коротке слово читається краще за речення: «Було / Стало», «Неправильно / Правильно», «До візиту / Після візиту»."
          />
        </label>
        <div className="admin-row">
          <input
            value={c.beforeLabel}
            onChange={(e) => set("beforeLabel")(e.target.value)}
            placeholder="Було"
            className="admin-input-flex"
          />
          <input
            value={c.afterLabel}
            onChange={(e) => set("afterLabel")(e.target.value)}
            placeholder="Стало"
            className="admin-input-flex"
          />
        </div>
        {!ready && <p className="admin-hint">Потрібні саме два фото — поки екран показує лише попередження.</p>}
      </div>
    </>
  );
}

/** «Порядок кроків»: правильна послідовність — та, у якій кроки стоять
 *  ТУТ. Плеєр показує їх перемішаними, тож окремого поля «правильна
 *  відповідь» немає й не може розсинхронитись зі списком. */
export function OrderingFields({ content, onChange, onUploadingChange }: FieldProps) {
  const c: Content = { lead: "", images: [], items: [], explanation: "", ...content };
  const set = fieldSetter(c, onChange);
  const items: OrderItem[] = c.items;
  const setItem = (item: OrderItem, text: string) => set("items")(items.map((it) => (it === item ? { ...it, text } : it)));

  // Ідентичність рядка — сам об'єкт `it` (референс), не index: індекс
  // міняється при кожній перестановці, а setItem вище лишає референс
  // НЕЗМІННИМ для всіх рядків, крім того, що редагують просто зараз —
  // достатньо для hooks/useDragReorder.ts, синтетичні id заводити не треба.
  const { containerRef, containerProps, registerRow, dragId, dragDeltaY, moveByKeyboard } = useDragReorder({
    ids: items,
    onReorder: set("items"),
  });

  return (
    <>
      <div className="admin-field">
        <label className="admin-label">Вступний рядок (необов&apos;язково)</label>
        <input value={c.lead} onChange={(e) => set("lead")(e.target.value)} className="admin-input-flex" placeholder="Наприклад: розставте етапи візиту" />
      </div>
      <ImageListEditor images={c.images} onChange={set("images")} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">
          Кроки у ПРАВИЛЬНОМУ порядку{" "}
          <HintDot
            align="start"
            text="Впишіть кроки так, як вони мають іти насправді — окремого поля «правильна відповідь» немає, правильний порядок це сам цей список. Співробітнику вони покажуться перемішаними, і він відновлює послідовність перетягуванням. Зарахується лише повний збіг: часткового балу тут немає."
          />
        </label>
        <div ref={containerRef} {...containerProps}>
          {items.map((it, i) => (
            <div
              key={i}
              ref={registerRow(it)}
              data-drag-row
              className={`admin-row admin-option-row admin-drag-row${dragId === it ? " is-dragging" : ""}`}
              style={dragId === it ? { transform: `translateY(${dragDeltaY}px)` } : undefined}
            >
              <button
                type="button"
                className="admin-drag-handle"
                data-drag-handle
                title="Перетягніть, щоб змінити порядок кроків"
                aria-label={`Перетягніть крок «${it.text || i + 1}» — або керуйте стрілками вгору/вниз`}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    moveByKeyboard(it, -1);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    moveByKeyboard(it, 1);
                  }
                }}
              >
                <GripIcon />
              </button>
              <span className="admin-hint" style={{ minWidth: 18 }}>
                {i + 1}
              </span>
              <input value={it.text || ""} onChange={(e) => setItem(it, e.target.value)} placeholder="Текст кроку" className="admin-input-flex" />
              <button
                type="button"
                onClick={() => set("items")(items.filter((x) => x !== it))}
                className="admin-icon-btn"
                aria-label="Видалити крок"
                title="Видалити цей крок"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => set("items")([...c.items, { text: "" }])} className="admin-btn-link" title="Додати ще один крок">
          + Додати крок
        </button>
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Пояснення <span className="admin-hint">— показується після відповіді</span>
        </label>
        <RichTextArea value={c.explanation} onChange={set("explanation")} rows={2} paragraphs={false} placeholder="Чому саме такий порядок" />
      </div>
    </>
  );
}

/** «Відповідність»: пари «ліве — праве». Ліва колонка показується як є,
 *  права перемішується, тож правильна пара — це просто рядок таблиці. */
export function MatchingFields({ content, onChange, onUploadingChange }: FieldProps) {
  const c: Content = { lead: "", images: [], pairs: [], explanation: "", ...content };
  const set = fieldSetter(c, onChange);
  const pairs: MatchPair[] = c.pairs;
  const setPair = (i: number, field: keyof MatchPair, value: string) =>
    set("pairs")(pairs.map((p, j) => (j === i ? { ...p, [field]: value } : p)));

  return (
    <>
      <div className="admin-field">
        <label className="admin-label">Вступний рядок (необов&apos;язково)</label>
        <input value={c.lead} onChange={(e) => set("lead")(e.target.value)} className="admin-input-flex" placeholder="Наприклад: зіставте бренд і категорію" />
      </div>
      <ImageListEditor images={c.images} onChange={set("images")} onUploadingChange={onUploadingChange} />
      <div className="admin-field">
        <label className="admin-label">
          Пари{" "}
          <HintDot
            align="start"
            text="Кожен рядок — одна правильна пара. Ліва колонка покажеться співробітнику в тому ж порядку, права — перемішаною; він зіставляє їх двома тапами. Три-п'ять пар читаються на телефоні найкраще: більше не вміщається на екран без прокрутки. Зарахується лише повний збіг."
          />
        </label>
        {pairs.map((p, i) => (
          <div className="admin-row admin-option-row" key={i}>
            <input value={p.left || ""} onChange={(e) => setPair(i, "left", e.target.value)} placeholder="Ліворуч" className="admin-input-flex" />
            <span className="admin-hint">—</span>
            <input value={p.right || ""} onChange={(e) => setPair(i, "right", e.target.value)} placeholder="Праворуч" className="admin-input-flex" />
            <button
              type="button"
              onClick={() => set("pairs")(pairs.filter((_, j) => j !== i))}
              className="admin-icon-btn"
              aria-label="Видалити пару"
              title="Видалити цю пару"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={() => set("pairs")([...c.pairs, { left: "", right: "" }])} className="admin-btn-link" title="Додати ще одну пару">
          + Додати пару
        </button>
      </div>
      <div className="admin-field">
        <label className="admin-label">
          Пояснення <span className="admin-hint">— показується після відповіді</span>
        </label>
        <RichTextArea value={c.explanation} onChange={set("explanation")} rows={2} paragraphs={false} placeholder="Що тут головне запам'ятати" />
      </div>
    </>
  );
}

export function InputFields({ content, onChange }: FieldProps) {
  const c: Content = { label: "", placeholder: "", multiline: false, ...content };
  const set = fieldSetter(c, onChange);

  return (
    <>
      <div className="admin-field">
        <label className="admin-label">Підпис над полем</label>
        <input value={c.label} onChange={(e) => set("label")(e.target.value)} placeholder="Наприклад: Ваші думки" className="admin-input-flex" />
      </div>
      <div className="admin-field">
        <label className="admin-label">Плейсхолдер у полі</label>
        <input value={c.placeholder} onChange={(e) => set("placeholder")(e.target.value)} className="admin-input-flex" />
      </div>
      <label className="admin-checkbox">
        <input type="checkbox" checked={c.multiline} onChange={(e) => set("multiline")(e.target.checked)} />
        <span>Багаторядкове поле</span>
      </label>
    </>
  );
}
