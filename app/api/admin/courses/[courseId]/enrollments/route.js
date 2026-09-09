import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// DELETE /api/admin/courses/:courseId/enrollments — знімає ВСІ призначення
// (Enrollment) з курсу, нічого не видаляючи з самого курсу. Існує окремо
// від DELETE /api/admin/courses/:courseId навмисно: той відмовляє (409),
// поки є хоч одне призначення (Enrollment.courseId обов'язковий, без
// onDelete: Cascade — щоб курс не зникав "тихо" разом із чиїмись реальними
// призначеннями) — це явний окремий крок саме для того, щоб адмін
// усвідомлено підтвердив "так, зняти саме призначення" окремо від "видалити
// курс".
export async function DELETE(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { courseId } = await params;
  const { count } = await prisma.enrollment.deleteMany({ where: { courseId: Number(courseId) } });
  return NextResponse.json({ removedCount: count });
}
