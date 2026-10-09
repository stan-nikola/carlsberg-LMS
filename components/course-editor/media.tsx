"use client";

import { useRef, useState } from "react";
import { SpinnerIcon } from "@/components/icons";
import { ListRowControls, useListOps } from "@/components/ListEditor";
import { parseVideoEmbed } from "@/lib/videoEmbed";
import type { MediaItem } from "@/components/course-editor/types";

// Не більше трьох фото на екран: далі вони на телефоні перетворюються на
// нескінченну стрічку, крізь яку треба гортати до тексту.
const MAX_IMAGES = 3;

function ImagePicker({
  image,
  index,
  total,
  onChange,
  onMove,
  onRemove,
  onUploadingChange,
  allowVideo,
}: {
  image: MediaItem;
  index: number;
  total: number;
  onChange: (next: MediaItem) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
  onUploadingChange: (uploading: boolean) => void;
  allowVideo?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // Відео — це посилання, а не файл (lib/videoEmbed.ts): те саме поле
  // приймає і шлях до фото, і адресу ролика, тож тип визначаємо з самого
  // значення, а не окремою кнопкою.
  const embed = allowVideo ? parseVideoEmbed(image.url || "") : null;
  const linkNotRecognized = allowVideo && !embed && /youtu|vimeo|tiktok|facebook|instagram|rutube/i.test(image.url || "");

  async function handleFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // щоб той самий файл можна було обрати повторно
    if (!file) return;

    setUploading(true);
    onUploadingChange?.(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });

      // Сервер міг впасти ДО того, як встиг сформувати JSON (мережева
      // помилка, обрив з'єднання) — тіло тоді порожнє, і res.json()
      // кидає незрозуміле "Unexpected end of JSON input" замість
      // реальної причини. Читаємо як текст і парсимо самі.
      const rawText = await res.text();
      const data = rawText ? JSON.parse(rawText) : {};

      if (!res.ok) {
        throw new Error(
          data.error === "not_configured"
            ? "Завантаження фото не налаштоване (BLOB_READ_WRITE_TOKEN)"
            : data.error || `Сервер не відповів (HTTP ${res.status})`
        );
      }
      // kind/poster скидаємо явно: слот міг бути відео, і без цього на
      // екрані лишився б плеєр зі старим постером поверх нового фото.
      onChange({ ...image, url: data.url, kind: "photo", poster: "" });
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  return (
    <div className="admin-image-picker">
      {image.url &&
        (embed ? (
          <iframe
            src={embed.src}
            title={embed.title}
            className="admin-video-preview"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <img src={image.url} alt="" className="admin-image-preview" />
        ))}
      <div className="admin-row">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFilePicked}
        />
        <button
          type="button"
          className="admin-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Завантажити файл зображення з комп'ютера"
        >
          {uploading && <SpinnerIcon />}
          {uploading ? "Завантаження…" : "Обрати фото…"}
        </button>
        <input
          placeholder={allowVideo ? "або посилання на YouTube / Vimeo" : "або встав URL /assets/…"}
          value={image.url}
          onChange={(e) => onChange({ ...image, url: e.target.value })}
          className="admin-input-flex admin-input-mono"
        />
        {/* Стрілки + видалення — той самий спільний ListRowControls, що й
            у решті списків конструктора (варіанти, пункти, кроки). Порядок
            фото тут — це порядок, у якому їх побачить співробітник, тому
            переставляти треба прямо тут, а не перезавантажувати файли. */}
        <ListRowControls index={index} total={total} onMove={onMove} onRemove={() => onRemove(index)} label="зображення" />
      </div>
      <p className="admin-hint">
        Формати: JPEG, PNG, WebP, GIF · до 8 МБ.
        {allowVideo && " Відео — вставте посилання на YouTube або Vimeo в те саме поле; плеєр з'явиться просто на екрані."}
      </p>
      <input
        placeholder="підпис (необов'язково)"
        value={(image.caption as string) ?? ""}
        onChange={(e) => onChange({ ...image, caption: e.target.value })}
        className="admin-input-flex"
      />
      {uploadError && <p className="admin-error">{uploadError}</p>}
      {/* Мовчазний провал розпізнавання — найгірше, що тут може бути:
          автор вставив посилання, побачив порожньо і не знає, чому. Тому
          на адресу з відеосервісу, яку не змогли розібрати, кажемо прямо. */}
      {linkNotRecognized && (
        <p className="admin-warning">
          Не вдалося розпізнати посилання. Підтримуються YouTube і Vimeo — скопіюйте адресу зі сторінки ролика
          (youtube.com/watch?v=… , youtu.be/… , vimeo.com/…).
        </p>
      )}
    </div>
  );
}

export function ImageListEditor({
  images,
  onChange,
  onUploadingChange,
  max = MAX_IMAGES,
  limitHint,
  allowVideo,
}: {
  images: MediaItem[];
  onChange: (next: MediaItem[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  max?: number;
  limitHint?: string;
  allowVideo?: boolean;
}) {
  // Скільки фото зараз вантажиться (за індексом) — Save блокується, поки
  // не 0, інакше можна зберегти екран з порожнім url (лист заповнення ще
  // не встиг прийти) — саме так з'являвся варнінг next/image про
  // порожній src і "фото не зберіглося".
  const uploadingIndicesRef = useRef(new Set<number>());

  function reportUploading(index: number, isUploading: boolean) {
    if (isUploading) uploadingIndicesRef.current.add(index);
    else uploadingIndicesRef.current.delete(index);
    onUploadingChange?.(uploadingIndicesRef.current.size > 0);
  }

  const ops = useListOps(images, onChange);
  function updateImage(index: number, next: MediaItem) {
    onChange(images.map((img, i) => (i === index ? next : img)));
  }
  const atLimit = images.length >= max;

  return (
    <div className="admin-field">
      <label className="admin-label">
        {allowVideo ? "Фото та відео" : "Зображення"}{" "}
        <span className="admin-hint">{max === 1 ? "— одне на це питання" : `— до ${max}, порядок задають стрілки`}</span>
      </label>
      {images.map((img, i) => (
        <ImagePicker
          key={i}
          image={img}
          index={i}
          total={images.length}
          onChange={(next) => updateImage(i, next)}
          onMove={ops.move}
          onRemove={ops.remove}
          onUploadingChange={(isUploading) => reportUploading(i, isUploading)}
          allowVideo={allowVideo}
        />
      ))}
      {atLimit ? (
        <p className="admin-hint">{limitHint || `Більше ${max} фото на один екран не додати — заберіть зайве, щоб додати інше.`}</p>
      ) : (
        <button type="button" onClick={() => ops.add({ url: "", caption: "" })} className="admin-btn-link" title="Додати ще один слот під фото">
          {allowVideo ? "+ Додати фото або відео" : "+ Додати зображення"}
        </button>
      )}
    </div>
  );
}
