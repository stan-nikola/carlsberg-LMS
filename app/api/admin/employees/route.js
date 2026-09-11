import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

const RESULT_LIMIT = 30;

// GET /api/admin/employees?q=...&showInactive=1 — пошук для UI скидання
// PIN / призначення ролі / детальної картки. 1900+ співробітників — тому
// без ?q повертаємо лише перші RESULT_LIMIT за іменем (просто "не пусто на
// старті"), а не весь список; пошук по externalCode/імені (contains, без
// урахування регістру) звужує. За замовчуванням деактивованих (isActive:
// false) не показуємо — showInactive=1 вмикає їх назад (для пошуку
// конкретної деактивованої людини, щоб її реактивувати).
export async function GET(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = request.nextUrl.searchParams.get("q")?.trim();
  const showInactive = request.nextUrl.searchParams.get("showInactive") === "1";

  const employees = await prisma.employee.findMany({
    where: {
      ...(showInactive ? {} : { isActive: true }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { externalCode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: RESULT_LIMIT,
    select: {
      id: true,
      name: true,
      externalCode: true,
      email: true,
      role: true,
      isActive: true,
      position: { select: { code: true, name: true } },
      territory: { select: { name: true } },
    },
  });

  return NextResponse.json({ employees, limit: RESULT_LIMIT });
}

// POST /api/admin/employees — ручне разове створення одного співробітника
// (окремо від масового Excel-імпорту, Фаза B — для одиничних випадків,
// коли когось треба завести негайно, не чекаючи наступного файлу). Мінімум
// обов'язкових полів: name + externalCode (той самий login-ключ, що й у
// реального імпорту, має лишатись унікальним).
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const name = String(body.name || "").trim();
  const externalCode = String(body.externalCode || "").trim();

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!externalCode) return NextResponse.json({ error: "externalCode is required" }, { status: 400 });

  const existing = await prisma.employee.findFirst({
    where: { externalCode: { equals: externalCode, mode: "insensitive" } },
  });
  if (existing) {
    return NextResponse.json({ error: "externalCode already exists" }, { status: 409 });
  }

  try {
    const created = await prisma.employee.create({
      data: {
        name,
        externalCode,
        email: body.email || null,
        positionId: body.positionId != null ? Number(body.positionId) : null,
        territoryId: body.territoryId != null ? Number(body.territoryId) : null,
        managerId: body.managerId != null ? Number(body.managerId) : null,
      },
      select: {
        id: true,
        name: true,
        externalCode: true,
        email: true,
        role: true,
        isActive: true,
        position: { select: { code: true, name: true } },
        territory: { select: { name: true } },
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "email already in use" }, { status: 409 });
    }
    throw err;
  }
}
