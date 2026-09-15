import { NextResponse } from "next/server";
import sharp from "sharp";
import { put, del } from "@vercel/blob";
import type { PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const prisma = prismaUntyped as PrismaClient;

/**
 * Фото профілю співробітника (Employee.avatarUrl).
 *  POST   multipart/form-data { file } — квадрат 256×256 WebP (обрізка по
 *         центру, поворот за EXIF) у Vercel Blob під avatars/<id>-<ts>.webp,
 *         старий файл видаляється best-effort. Приймаємо лише растрові
 *         формати (SVG — ні, XSS), до 8 МБ, як admin/upload.
 *  DELETE — прибрати фото (повернуться ініціали).
 * Лише для самого себе — сесія співробітника, ніякого employeeId у запиті.
 */
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);
const MAX_BYTES = 8 * 1024 * 1024;
const SIZE = 256;

export async function POST(request: Request) {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "not_configured" }, { status: 500 });

  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Дозволені формати: JPEG, PNG, WebP, GIF, HEIC." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Файл завеликий (максимум 8 МБ)." }, { status: 400 });

  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(SIZE, SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "Не вдалося прочитати зображення." }, { status: 400 });
  }

  try {
    const blob = await put(`avatars/${employee.id}-${Date.now()}.webp`, webp, {
      access: "public",
      contentType: "image/webp",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const previous = employee.avatarUrl;
    await prisma.employee.update({ where: { id: employee.id }, data: { avatarUrl: blob.url } });
    if (previous) del(previous, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("[profile/avatar] put() failed:", err);
    return NextResponse.json({ error: "Завантаження не вдалося. Спробуйте ще раз." }, { status: 500 });
  }
}

export async function DELETE() {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const previous = employee.avatarUrl;
  await prisma.employee.update({ where: { id: employee.id }, data: { avatarUrl: null } });
  if (previous && process.env.BLOB_READ_WRITE_TOKEN) del(previous, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
  return NextResponse.json({ ok: true });
}
