import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { slugify, uniqueSlug } from "@/lib/slug";

// GET /api/admin/courses — легкий список курсів із блоками (без
// модулів/уроків) для дерева на дашборді /admin. _count.enrollments —
// Фаза E (пошук/фільтр каталогу) — щоб список показував "Призначено: N"
// без окремого запиту на кожен курс.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const courses = await prisma.course.findMany({
    orderBy: { title: "asc" },
    include: {
      modules: { orderBy: { order: "asc" } },
      _count: { select: { enrollments: true } },
    },
  });
  return NextResponse.json(courses);
}

// POST /api/admin/courses — { title, description?, category?, isMandatory?,
// deadlineDays?, streakMessages?, targetPositions?, targetTerritories?,
// targetEmployeeIds?, publishAt?, folderId? }
// slug генерується з title автоматично (транслітерація + унікальність).
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  if (!body.title || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const slug = await uniqueSlug(slugify(body.title));

  const course = await prisma.course.create({
    data: {
      slug,
      title: body.title,
      description: body.description || null,
      category: body.category || null,
      isMandatory: Boolean(body.isMandatory),
      deadlineDays: body.deadlineDays === "" || body.deadlineDays == null ? null : Number(body.deadlineDays),
      moduleDays: body.moduleDays === "" || body.moduleDays == null ? null : Number(body.moduleDays),
      modulePauseDays: body.modulePauseDays === "" || body.modulePauseDays == null ? null : Number(body.modulePauseDays),
      passThreshold: body.passThreshold === "" || body.passThreshold == null ? 80 : Number(body.passThreshold),
      points: body.points === "" || body.points == null ? null : Number(body.points),
      // Дефолти повторюють schema.prisma: сертифікат видається, якщо не
      // сказано інакше; авто-призначення новоприбулим — лише за явним
      // проханням.
      certificateEnabled: body.certificateEnabled === undefined ? true : Boolean(body.certificateEnabled),
      assignOnFirstLogin: Boolean(body.assignOnFirstLogin),
      // "phone"/"laptop" — під який екран НАСАМПЕРЕД узгоджували контент
      // курсу (Загальна інформація в /admin), лише прапорець-намір для
      // прев'ю в AdminCourseEditor.jsx; реальний застосунок співробітника
      // сам адаптується під його справжній екран (@container-запити в
      // course-player.css), це поле на нього не впливає.
      previewDevice: body.previewDevice === "laptop" ? "laptop" : "phone",
      streakMessages: body.streakMessages || null,
      targetPositions: body.targetPositions || [],
      targetTerritories: body.targetTerritories || [],
      targetEmployeeIds: body.targetEmployeeIds || [],
      publishAt: body.publishAt ? new Date(body.publishAt) : null,
      folderId: body.folderId != null ? Number(body.folderId) : null,
    },
    include: { modules: true, _count: { select: { enrollments: true } } },
  });
  await audit("course.create", "course", course.id, { title: course.title });
  return NextResponse.json(course, { status: 201 });
}
