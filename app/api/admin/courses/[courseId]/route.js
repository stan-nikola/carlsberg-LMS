import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/adminAuth";
import { slugify, uniqueSlug } from "@/lib/slug";
import { courseFieldsFromBody } from "@/lib/courseFields";
import { invalidateEmployeeEnrollments } from "@/lib/employeeProgress";

// GET /api/admin/courses/:courseId — повне дерево курс -> модулі -> екрани
// -> компоненти, для адмінського редактора контенту.
export async function GET(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { courseId } = await params;
  const course = await prisma.course.findUnique({
    where: { id: Number(courseId) },
    include: {
      modules: {
        orderBy: { order: "asc" },
        include: {
          screens: {
            orderBy: { order: "asc" },
            include: { components: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(course);
}

// PATCH /api/admin/courses/:courseId — { title?, description?, category?,
// isMandatory?, deadlineDays?, streakMessages?, targetPositions?,
// targetTerritories?, targetEmployeeIds?, publishAt?, folderId? }
// folderId — переміщення курсу в папку каталогу (CourseFolder, Фаза E
// адмінки) drag-and-drop'ом; null повертає курс у корінь каталогу.
// Курсовий рівень налаштувань (хто і коли отримує курс) — не плутати з
// призначенням "тут і зараз" через /assign. Зміна title перегенеровує slug
// (транслітерація), якщо на курс ще нема жодного Enrollment.
export async function PATCH(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { courseId } = await params;
  const id = Number(courseId);
  const body = await request.json().catch(() => ({}));
  const data = courseFieldsFromBody(body);
  if (body.title !== undefined) {

    // Перегенеровуємо slug під нову назву — АЛЕ тільки якщо на курс ще
    // ніхто не записаний: slug живе в публічному URL (/courses/[slug]),
    // на нього зав'язаний прогрес у localStorage кожного співробітника
    // (course_progress_<slug> — components/CoursePlayer.jsx) і пошук
    // Enrollment. Змінити його заднім числом, коли прогрес уже є —
    // означає непомітно "загубити" той прогрес. Порожній курс (як
    // щойно перейменований "Адамтация" -> "Адаптація") це не зачіпає.
    const enrollmentCount = await prisma.enrollment.count({ where: { courseId: id } });
    if (enrollmentCount === 0) {
      const current = await prisma.course.findUnique({ where: { id }, select: { slug: true } });
      const desiredBase = slugify(body.title);
      if (current && !current.slug.startsWith(desiredBase)) {
        data.slug = await uniqueSlug(desiredBase, id);
      }
    }
  }
  // Дату публікації змінили вручну — скидаємо позначку «вже авто-призначено»,
  // інакше cron бачив би autoAssignedAt і пропускав курс назавжди.
  if (body.publishAt !== undefined) data.autoAssignedAt = null;

  const course = await prisma.course.update({ where: { id: Number(courseId) }, data });
  // Назва, терміни, поріг — у плитках і плані курсу співробітника.
  invalidateEmployeeEnrollments();
  await audit("course.update", "course", courseId, data);
  return NextResponse.json(course);
}

// DELETE /api/admin/courses/:courseId — каскадно видаляє модулі/екрани/
// компоненти (onDelete: Cascade у schema.prisma). Enrollment на курс НЕ видаляється
// каскадно навмисно (без onDelete: Cascade у зв'язку Enrollment.course) —
// якщо на курс уже хтось записаний, відмовляємо заздалегідь із зрозумілою
// причиною, а не даємо Postgres впасти сирим 500 на FK-обмеженні.
export async function DELETE(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { courseId } = await params;
  const id = Number(courseId);

  const enrollmentCount = await prisma.enrollment.count({ where: { courseId: id } });
  if (enrollmentCount > 0) {
    return NextResponse.json(
      {
        error: `На курс призначено ${enrollmentCount} співробітник(ів). Спершу зніміть призначення.`,
        enrollmentCount,
      },
      { status: 409 }
    );
  }

  await prisma.course.delete({ where: { id } });
  await audit("course.delete", "course", id);
  return NextResponse.json({ ok: true });
}
