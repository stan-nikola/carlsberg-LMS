import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { requireAdmin } from "@/lib/adminAuth";

// Довша сторона — 1920px вистачає для будь-якого реального показу фото
// курсу (телефон, планшет, прев'ю в адмінці); більше — зайва вага без
// видимої різниці. withoutEnlargement — не розтягуємо маленькі фото.
const MAX_DIMENSION = 1920;

/**
 * Стискає фото перед завантаженням у Blob (аудит швидкодії, 2026-09-18):
 * до цього оригінал (до 8 МБ) клався як є — і в плеєрі (через next/image,
 * який усе одно спершу тягне оригінал з Blob), і особливо в адмінці, де
 * прев'ю рендериться звичайним <img> без жодної оптимізації взагалі.
 * Безпечно для hotspot-зон (components/AdminCourseEditor.jsx
 * HotspotFields) — їхні координати завжди у відсотках від РЕНДЕРЕНОГО
 * розміру фото, не від пікселів оригіналу, тож ресайз на них не впливає.
 * gif/анімований webp — animated:true, щоб не схлопнути в один кадр.
 */
async function compressImage(buffer, mimeType) {
  const animated = mimeType === "image/gif" || mimeType === "image/webp";
  let img = sharp(buffer, animated ? { animated: true } : undefined)
    .rotate() // орієнтація з EXIF, сам EXIF далі не зберігається
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true });

  if (mimeType === "image/jpeg") img = img.jpeg({ quality: 82, mozjpeg: true });
  else if (mimeType === "image/png") img = img.png({ compressionLevel: 9 });
  else if (mimeType === "image/webp") img = img.webp({ quality: 82 });
  else if (mimeType === "image/gif") img = img.gif();

  return img.toBuffer();
}

// POST /api/admin/upload — multipart/form-data з полем "file". Приймає
// фото з "провідника файлів" (кнопка вибору фото в /admin) і кладе його у
// Vercel Blob (BLOB_READ_WRITE_TOKEN у .env, ключ сюди не пишу) — працює
// однаково локально і на Vercel (на відміну від запису на диск, який на
// Vercel не переживає навіть один redeploy).
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // Найпоширеніші растрові формати для фото на екранах курсу — SVG свідомо
  // не пускаємо (потенційний XSS: SVG може містити <script>), інші формати
  // (HEIC, TIFF тощо) браузер однаково не показує напряму через <img>.
  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Непідтримуваний формат (${file.type || "невідомий"}). Дозволені: JPEG, PNG, WebP, GIF.` },
      { status: 400 }
    );
  }

  const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 МБ
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Файл завеликий (максимум 8 МБ)." }, { status: 400 });
  }

  try {
    let body = file;
    try {
      body = await compressImage(Buffer.from(await file.arrayBuffer()), file.type);
    } catch (err) {
      // Пошкоджений/нестандартний файл, який пройшов перевірку MIME, але
      // не декодується sharp — не блокуємо завантаження, кладемо оригінал.
      console.warn("[admin/upload] compression failed, uploading original:", err.message);
    }
    const blob = await put(`course-images/${Date.now()}-${file.name}`, body, {
      access: "public",
      contentType: file.type,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    // Раніше падало без try/catch — клієнт бачив порожню відповідь і
    // "Unexpected end of JSON input" замість реальної причини. Тепер
    // повертаємо саме те, що каже Vercel Blob (невірний токен, немає
    // доступу до сховища тощо).
    console.error("[admin/upload] put() failed:", err);
    return NextResponse.json({ error: `Завантаження не вдалося: ${err.message}` }, { status: 500 });
  }
}
