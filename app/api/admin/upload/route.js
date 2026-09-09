import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAdmin } from "@/lib/adminAuth";

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
    const blob = await put(`course-images/${Date.now()}-${file.name}`, file, {
      access: "public",
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
