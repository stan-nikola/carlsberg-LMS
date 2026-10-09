import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { adminGuard } from "@/lib/adminAuth";
import { removeEnrollments } from "@/lib/courseAssignment";

// DELETE /api/admin/courses/:courseId/enrollments — знімає ВСІ призначення
// (Enrollment) з курсу, нічого не видаляючи з самого курсу. Існує окремо
// від DELETE /api/admin/courses/:courseId навмисно: той відмовляє (409),
// поки є хоч одне призначення (Enrollment.courseId обов'язковий, без
// onDelete: Cascade — щоб курс не зникав "тихо" разом із чиїмись реальними
// призначеннями) — це явний окремий крок саме для того, щоб адмін
// усвідомлено підтвердив "так, зняти саме призначення" окремо від "видалити
// курс".
export async function DELETE(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { courseId } = await params;
  const { removedCount, pointsRemoved } = await removeEnrollments({ courseId: Number(courseId) });
  await audit("course.unassign_all", "course", courseId, { removedCount, pointsRemoved });
  return NextResponse.json({ removedCount, pointsRemoved });
}
