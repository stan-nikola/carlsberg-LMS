import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/courses/:courseId/question-stats
 *
 * Частка правильних відповідей по КОЖНОМУ питанню курсу — те, чого раніше
 * не було видно взагалі: у базі лежав лише бал за модуль, тож «модуль
 * складний» було видно, а «оце питання погане» — ні (2026-09-17).
 *
 * Рахується по всіх спробах усіх співробітників: питання, на яке з
 * десяти разів відповіли правильно двічі, або сформульоване незрозуміло,
 * або матеріал його не пояснює. І те, і те — робота автора курсу, тому
 * цифра живе саме в конструкторі, поруч із самим питанням.
 */
export async function GET(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { courseId } = await params;
  const rows = await prisma.questionAnswer.groupBy({
    by: ["componentId", "correct"],
    where: { component: { screen: { module: { courseId: Number(courseId) } } } },
    _count: { _all: true },
  });

  /** { [componentId]: { total, correct, pct } } */
  const byComponent = {};
  for (const r of rows) {
    const entry = byComponent[r.componentId] || { total: 0, correct: 0, pct: null };
    entry.total += r._count._all;
    if (r.correct) entry.correct += r._count._all;
    byComponent[r.componentId] = entry;
  }
  for (const entry of Object.values(byComponent)) {
    entry.pct = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : null;
  }

  return NextResponse.json({ stats: byComponent });
}
