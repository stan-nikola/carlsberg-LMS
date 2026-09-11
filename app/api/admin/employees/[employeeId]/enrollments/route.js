import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/employees/:employeeId/enrollments — список призначених
// курсів конкретної людини (Фаза D, вкладка "Курси" на детальній картці)
// разом з adminNote — щоб було видно, що вже корегувалось вручну раніше.
export async function GET(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { employeeId } = await params;
  const enrollments = await prisma.enrollment.findMany({
    where: { employeeId: Number(employeeId) },
    orderBy: { assignedAt: "desc" },
    select: {
      id: true,
      status: true,
      scorePercent: true,
      passed: true,
      assignedAt: true,
      dueDate: true,
      completedAt: true,
      durationSeconds: true,
      adminNote: true,
      course: { select: { id: true, title: true } },
    },
  });
  return NextResponse.json({ enrollments });
}
