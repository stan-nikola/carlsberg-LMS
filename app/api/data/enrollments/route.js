import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyApiToken } from "@/lib/adminApiToken";

// GET /api/data/enrollments — див. app/api/data/employees/route.js (той
// самий Bearer-токен). employeeId/courseId тут — ключі, якими Excel
// (Power Pivot Data Model) зв'яже цю таблицю з employees/courses.
export async function GET(request) {
  const token = await verifyApiToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const enrollments = await prisma.enrollment.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      employeeId: true,
      courseId: true,
      status: true,
      scorePercent: true,
      passed: true,
      assignedAt: true,
      dueDate: true,
      completedAt: true,
      durationSeconds: true,
    },
  });

  return NextResponse.json(enrollments);
}
