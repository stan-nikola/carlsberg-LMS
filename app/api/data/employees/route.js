import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyApiToken } from "@/lib/adminApiToken";

// GET /api/data/employees — Фаза B3, "жива" Power Query книга. Захищено
// Bearer-токеном (app/api/admin/tokens), НЕ admin_session cookie — Excel
// підключається сюди напряму (Get Data > From Web), тягне JSON, і сам
// користувач будує PivotTable/Data Model поверх цих трьох таблиць
// (employees/courses/enrollments) через employeeId/courseId — той самий
// принцип, що Power Pivot/OLAP-аналіз без окремого BI-сервера.
export async function GET(request) {
  const token = await verifyApiToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employees = await prisma.employee.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      externalCode: true,
      email: true,
      role: true,
      isActive: true,
      managerId: true,
      createdAt: true,
      firstLoginAt: true,
      position: { select: { name: true, code: true } },
      territory: { select: { name: true } },
    },
  });

  return NextResponse.json(
    employees.map((e) => ({
      id: e.id,
      name: e.name,
      externalCode: e.externalCode,
      email: e.email,
      role: e.role,
      isActive: e.isActive,
      managerId: e.managerId,
      positionCode: e.position?.code || null,
      positionName: e.position?.name || null,
      territoryName: e.territory?.name || null,
      createdAt: e.createdAt,
      firstLoginAt: e.firstLoginAt,
    }))
  );
}
