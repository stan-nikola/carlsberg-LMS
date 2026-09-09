import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

const RESULT_LIMIT = 30;

// GET /api/admin/employees?q=... — пошук для UI скидання PIN / призначення
// ролі. 1900+ співробітників — тому без ?q повертаємо лише перші
// RESULT_LIMIT за іменем (просто "не пусто на старті"), а не весь список;
// пошук по externalCode/імені (contains, без урахування регістру) звужує.
export async function GET(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = request.nextUrl.searchParams.get("q")?.trim();

  const employees = await prisma.employee.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { externalCode: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
    take: RESULT_LIMIT,
    select: {
      id: true,
      name: true,
      externalCode: true,
      email: true,
      role: true,
      position: { select: { code: true, name: true } },
      territory: { select: { name: true } },
    },
  });

  return NextResponse.json({ employees, limit: RESULT_LIMIT });
}
