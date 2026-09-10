import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getCourseForPlayer,
  getEnrollmentForCourse,
  flattenLessons,
  flattenModules,
  computeBlockAvailability,
} from "@/lib/courseContent";
import { CoursePlayer } from "@/components/CoursePlayer";

// Доступ лише призначеним (є Enrollment) — на відміну від legacy, де курс
// відкривався будь-кому із профілем платформи; тепер призначення явне
// (assignCourseToRole / адмін-ендпоінт із Кроку 2).
export default async function CoursePage({ params }) {
  const { slug } = await params;
  const employee = await getCurrentUser();
  if (!employee) redirect("/register");

  const course = await getCourseForPlayer(slug);
  if (!course) notFound();

  const enrollment = await getEnrollmentForCourse(employee.id, course.id);
  if (!enrollment) {
    return (
      <div className="stage">
        <div className="course-col">
          <div className="course-card">
            <div className="cp-viewport">
              <div className="cp-screen">
                <h2 className="cp-h2">Курс ще не призначено</h2>
                <p className="cp-lead">
                  Цей курс вам поки не призначено. Зверніться до вашого керівника або адміністратора.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // "Пауза між блоками" (Block.cooldownDays): блок N+1 доступний лише
  // якщо блок N складено (BlockCompletion.passed) і минула пауза.
  const completions = await prisma.blockCompletion.findMany({ where: { enrollmentId: enrollment.id } });
  const completionsByBlockId = new Map(completions.map((c) => [c.blockId, c]));
  const blockAvailability = computeBlockAvailability(course, completionsByBlockId);

  // Послідовне відкриття модулів усередині доступного блоку: модуль з
  // unlockAfterDays доступний лише через N днів після Enrollment.assignedAt
  // (календарний графік, не залежить від темпу проходження — див.
  // коментар у schema.prisma). Ще не відкриті модулі просто не потрапляють
  // у screens.
  const now = new Date();
  function moduleUnlocksAt(unlockAfterDays) {
    if (!unlockAfterDays) return null;
    const d = new Date(enrollment.assignedAt);
    d.setDate(d.getDate() + unlockAfterDays);
    return d;
  }

  const availableBlocks = course.blocks.filter((b) => blockAvailability.get(b.id).available);
  const lockedModuleIds = new Set(
    flattenModules({ blocks: availableBlocks })
      .filter((m) => {
        const at = moduleUnlocksAt(m.unlockAfterDays);
        return at && at > now;
      })
      .map((m) => m.id)
  );

  const courseWithAvailableContent = {
    ...course,
    blocks: availableBlocks.map((block) => ({
      ...block,
      modules: block.modules.filter((m) => !lockedModuleIds.has(m.id)),
    })),
  };

  const screens = flattenLessons(courseWithAvailableContent).map((lesson) => ({
    id: lesson.id,
    type: lesson.type,
    title: lesson.title,
    content: lesson.content,
    blockId: lesson.blockId,
    blockTitle: lesson.blockTitle,
  }));

  // Повідомлення про те, що ще недоступно — перше заблоковане (модуль
  // всередині доступного блоку АБО наступний блок), у порядку проходження.
  let lockedNotice = null;
  const lockedModule = flattenModules({ blocks: availableBlocks }).find((m) => lockedModuleIds.has(m.id));
  if (lockedModule) {
    lockedNotice = `Наступний розділ курсу відкриється ${moduleUnlocksAt(lockedModule.unlockAfterDays).toLocaleDateString("uk-UA")}.`;
  } else {
    const nextLockedBlock = course.blocks.find((b) => !blockAvailability.get(b.id).available);
    if (nextLockedBlock) {
      const info = blockAvailability.get(nextLockedBlock.id);
      lockedNotice = info.waitingForPrevious
        ? `Блок «${nextLockedBlock.title}» відкриється після того, як ви складете попередній блок.`
        : `Блок «${nextLockedBlock.title}» відкриється ${info.unlocksAt.toLocaleDateString("uk-UA")}.`;
    }
  }

  return (
    <CoursePlayer
      course={{
        id: course.id,
        slug: course.slug,
        title: course.title,
        description: course.description,
        streakMessages: course.streakMessages,
      }}
      screens={screens}
      enrollmentId={enrollment.id}
      lockedNotice={lockedNotice}
    />
  );
}
