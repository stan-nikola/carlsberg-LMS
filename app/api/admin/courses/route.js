import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/adminAuth";
import { slugify, uniqueSlug } from "@/lib/slug";
import { courseFieldsFromBody } from "@/lib/courseFields";

// GET /api/admin/courses — легкий список курсів із блоками (без
// модулів/уроків) для дерева на дашборді /admin. _count.enrollments —
// Фаза E (пошук/фільтр каталогу) — щоб список показував "Призначено: N"
// без окремого запиту на кожен курс.
export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;

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
  const denied = await adminGuard();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  if (!body.title || !body.title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const slug = await uniqueSlug(slugify(body.title));

  const course = await prisma.course.create({
    data: {
      // Дефолти, як у schema.prisma: сертифікат видається, якщо не сказано
      // інакше; цілі призначення порожні.
      certificateEnabled: true,
      targetPositions: [],
      targetTerritories: [],
      targetEmployeeIds: [],
      ...courseFieldsFromBody(body),
      slug,
    },
    include: { modules: true, _count: { select: { enrollments: true } } },
  });
  await audit("course.create", "course", course.id, { title: course.title });
  return NextResponse.json(course, { status: 201 });
}
