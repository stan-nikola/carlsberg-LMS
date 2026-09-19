import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
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
  // Спершу — id, бо після deleteMany не буде за чим прибрати бали:
  // RatingEvent посилається на enrollment через refType/refId, без FK і
  // без каскаду.
  const ids = (await prisma.enrollment.findMany({ where: { courseId: Number(courseId) }, select: { id: true } })).map((e) => e.id);
  const { count } = await prisma.enrollment.deleteMany({ where: { courseId: Number(courseId) } });
  const { count: pointsRemoved } = await prisma.ratingEvent.deleteMany({ where: { refType: "enrollment", refId: { in: ids } } });
  await audit("course.unassign_all", "course", courseId, { removedCount: count, pointsRemoved });
  return NextResponse.json({ removedCount: count, pointsRemoved });
}
