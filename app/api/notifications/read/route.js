import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

/**
 * POST /api/notifications/read — { ids: number[] } або { all: true }.
 * Позначає прочитаними ЛИШЕ свої (where employeeId) — чужі id ігноруються.
 */
export async function POST(request) {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const now = new Date();
  const where = { employeeId: employee.id, isRead: false };
  if (body.all === true) {
    const r = await prisma.notification.updateMany({ where, data: { isRead: true, readAt: now } });
    return NextResponse.json({ updated: r.count });
  }
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids or all required" }, { status: 400 });
  const r = await prisma.notification.updateMany({ where: { ...where, id: { in: ids } }, data: { isRead: true, readAt: now } });
  return NextResponse.json({ updated: r.count });
}
