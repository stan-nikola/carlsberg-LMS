import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// GET /api/admin/course-folders — усі папки каталогу курсів, пласким
// списком (реалістично одиниці-десятки, не сотні — клієнт сам будує
// дерево/breadcrumb по parentId, той самий підхід, що
// /api/admin/territories для TerritoryPicker).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const folders = await prisma.courseFolder.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, parentId: true },
  });
  return NextResponse.json({ folders });
}

// POST /api/admin/course-folders — { name, parentId? } — створити нову
// папку в корені каталогу (parentId: null) або всередині іншої.
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const parentId = body.parentId != null ? Number(body.parentId) : null;

  // Заборона дублікату назви В МЕЖАХ однієї батьківської папки (як у
  // Провіднику Windows) — findFirst/insensitive, а не унікальний індекс
  // у схемі, бо унікальність скопована на (parentId, name), не на саму
  // назву глобально.
  const duplicate = await prisma.courseFolder.findFirst({
    where: { parentId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "Папка з такою назвою вже існує тут." }, { status: 409 });
  }

  const created = await prisma.courseFolder.create({
    data: { name, parentId },
    select: { id: true, name: true, parentId: true },
  });
  return NextResponse.json(created, { status: 201 });
}
