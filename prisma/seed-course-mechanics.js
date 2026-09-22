// Стенд для обкатки МЕХАНІКИ курсів (2026-09-22): один тестовий співробітник
// + три легкі курси «Механіка 5/10/15», у яких кожна умова рушія (паузи між
// модулями, явний нуль поверх паузи курсу, тижневий замок, гейт пересдачі
// курсу й модуля, пул питань, поріг 100, всі 4 типи питань, пересдача
// заради 100%, модуль без питань, м'який графік «відстаєте», прострочений
// дедлайн) закрита конкретним модулем. Повторюваний: кожен запуск зносить
// усі призначення співробітника, старий «Тест графіка» й попередні
// «Механіка», і створює все заново — сценарії можна ганяти скільки завгодно.
//
// Plain CommonJS, як і решта prisma/*.js (CLAUDE.md), тому не імпортує
// lib/ — enrollEmployees/syncEnrollmentEvents повторені мінімально:
// Enrollment із dueDate/isMandatory як у lib/courseAssignment.js, і
// зняття RatingEvent за видалені призначення (FK там нема свідомо).
//
//   node prisma/seed-course-mechanics.js            # TECH0072
//   node prisma/seed-course-mechanics.js --employee=TECH0071
//   node prisma/seed-course-mechanics.js --dry-run  # лише показати план
//
// База спільна з продом (рішення користувача 2026-09-22: тестуємо на
// спільній) — скрипт торкається ЛИШЕ цього співробітника і ЛИШЕ цих
// курсів, нічого більше.
require("dotenv/config");
const { PrismaClient } = require("../app/generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const EMPLOYEE_CODE = args.employee || "TECH0072";
const DRY_RUN = "dry-run" in args;
const SYSTEM_ADMIN_EXTERNAL_CODE = "SYSTEM-ADMIN";
// Старий тестовий курс — прибираємо скрізь (модулі там стояли не по порядку,
// що й виглядало як «перескакування»).
const LEGACY_TEST_SLUGS = ["test-hrafika-10-moduliv"];
const HOTSPOT_IMAGE = "/assets/assortment-production.jpg";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);
const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);

// ---------- контент ----------
function info(order, title, body, extra = {}) {
  return { order, type: "info", title, content: { kicker: "ТЕОРІЯ", lead: "", body, images: [], ...extra } };
}
function quiz(order, question, correct, wrong = ["Ні, це не так", "Не впевнений"]) {
  return {
    order,
    type: "quiz",
    title: question,
    content: {
      questionType: "single",
      images: [],
      shuffleOptions: true,
      explanation: "",
      options: [
        { text: correct, correct: true, explanation: "Саме так — правильна відповідь." },
        ...wrong.map((t) => ({ text: t, correct: false, explanation: "Ні. Правильна відповідь була підказана в теорії модуля." })),
      ],
    },
  };
}
const theoryBody = (course, k, note) =>
  `Це модуль **${k}** курсу «${course}». Правильна відповідь на питання цього модуля — **«Так, саме так»**.${note ? `\n\n${note}` : ""}`;

/** Стандартний модуль: екран теорії + екран з одним питанням. */
function stdModule(course, k, opts = {}) {
  return {
    title: `Модуль ${k}`,
    order: k,
    ...opts.module,
    screens: {
      create: [
        { title: "Теорія", order: 1, components: { create: [info(1, `Теорія модуля ${k}`, theoryBody(course, k, opts.note)), ...(opts.extraTheory || [])] } },
        ...(opts.noQuestion
          ? [{ title: "Підсумок", order: 2, components: { create: [info(1, "Підсумок", "У цьому модулі **немає питань** — лише теорія. Механіка: модуль без питань має зараховуватись як складений на 100%.")] } }]
          : [{ title: "Питання", order: 2, components: { create: opts.questions || [quiz(1, `Модуль ${k}: правильна відповідь — «Так, саме так»?`, "Так, саме так")] } }]),
      ],
    },
  };
}

// ---------- три курси ----------
function courseMechanics5() {
  const c = "Механіка 5";
  return {
    slug: "mechanics-5",
    title: c,
    description: "Еталон «підряд за одну сесію»: без пауз, поріг 50%. Модулі 3/4 — по 2 питання (сдати на 50% і покращити до 100%: модуль 3 — одразу, модуль 4 — через 2 дні), модуль 5 — без питань. Дедлайн 7 днів, графік 1 модуль/день.",
    isMandatory: true,
    deadlineDays: 7,
    moduleDays: 1,
    modulePauseDays: 0,
    passThreshold: 50,
    category: "Продажі",
    modules: {
      create: [
        stdModule(c, 1),
        stdModule(c, 2, {
          note: "На цьому екрані є гейт: «Далі» відкриється, лише коли відкрито обидві картки нижче.",
          extraTheory: [
            { order: 2, type: "accordion", title: "", content: { lead: "Відкрийте обидві картки:", images: [], items: [{ title: "Картка 1", body: "Гейт — це не питання, у бал не йде." }, { title: "Картка 2", body: "Лише розблоковує «Далі»." }] } },
          ],
        }),
        stdModule(c, 3, {
          module: { retakeCooldownDays: 0 },
          note: "2 питання, поріг курсу 50%: одна помилка = **складено на 50%**. Покращити до 100% можна **одразу** (retakeCooldownDays 0).",
          questions: [quiz(1, "Модуль 3, питання 1 з 2: правильна відповідь — «Так, саме так»?", "Так, саме так"), quiz(2, "Модуль 3, питання 2 з 2: правильна відповідь — «Так, саме так»?", "Так, саме так")],
        }),
        stdModule(c, 4, {
          module: { retakeCooldownDays: 2 },
          note: "2 питання, поріг 50%. Покращити до 100% — лише **через 2 дні** після складання.",
          questions: [quiz(1, "Модуль 4, питання 1 з 2: правильна відповідь — «Так, саме так»?", "Так, саме так"), quiz(2, "Модуль 4, питання 2 з 2: правильна відповідь — «Так, саме так»?", "Так, саме так")],
        }),
        stdModule(c, 5, { noQuestion: true }),
      ],
    },
  };
}

function courseMechanics10() {
  const c = "Механіка 10";
  return {
    slug: "mechanics-10",
    title: c,
    description: "Паузи: 1 день між модулями (курс), модуль 5 — 7 днів (тижневий замок), модуль 7 — явний 0 поверх паузи курсу. 1 вільна спроба + 24 год паузи пересдачі. Графік 2 дні/модуль, дедлайн 30 днів; призначено 5 днів тому → «відстаєте».",
    isMandatory: true,
    deadlineDays: 30,
    moduleDays: 2,
    modulePauseDays: 1,
    retryFreeAttempts: 1,
    retryCooldownHours: 24,
    passThreshold: 80,
    category: "Продажі",
    modules: {
      create: Array.from({ length: 10 }, (_, i) => {
        const k = i + 1;
        if (k === 5) return stdModule(c, k, { module: { cooldownDays: 7 }, note: "Перед цим модулем — власна пауза **7 днів** після складання модуля 4 (тижневий замок)." });
        if (k === 7) return stdModule(c, k, { module: { cooldownDays: 0 }, note: "У цього модуля **явний 0** пауз — має відкритись одразу після модуля 6, попри загальну паузу курсу 1 день." });
        return stdModule(c, k, k === 2 ? { note: "Перед цим модулем — загальна пауза курсу **1 день** після складання модуля 1." } : {});
      }),
    },
  };
}

function courseMechanics15() {
  const c = "Механіка 15";
  const yes = "Так, саме так";
  return {
    slug: "mechanics-15",
    title: c,
    description: "Три фази (паузи 3 дні перед модулями 6 і 11), поріг 100%, пул питань (модуль 3), усі 4 типи питань (модуль 12), гейт пересдачі модуля (14), 2 питання для сценарію провалу (15). Дедлайн 21 день, призначено 25 днів тому → прострочено.",
    isMandatory: true,
    deadlineDays: 21,
    moduleDays: 1,
    modulePauseDays: 0,
    passThreshold: 100,
    category: "Продажі",
    modules: {
      create: Array.from({ length: 15 }, (_, i) => {
        const k = i + 1;
        if (k === 3)
          return stdModule(c, k, {
            module: { questionPoolSize: 1 },
            note: "У модулі 3 питання, але за спробу показується **1 випадкове** (пул). При пересдачі питання має змінитись.",
            questions: [quiz(1, "Пул, питання A: правильна відповідь — «Так, саме так»?", yes), quiz(2, "Пул, питання B: правильна відповідь — «Так, саме так»?", yes), quiz(3, "Пул, питання C: правильна відповідь — «Так, саме так»?", yes)],
          });
        if (k === 6 || k === 11) return stdModule(c, k, { module: { cooldownDays: 3 }, note: `Перед модулем ${k} — пауза **3 дні** (початок нової фази).` });
        if (k === 12)
          return stdModule(c, k, {
            note: "На екрані питань — усі 4 типи: питання, гаряча точка, порядок кроків, відповідність. Кожне дає один булевий результат.",
            questions: [
              quiz(1, "Тип quiz: правильна відповідь — «Так, саме так»?", yes),
              { order: 2, type: "hotspot", title: "Гаряча точка", content: { kicker: "ГАРЯЧА ТОЧКА", lead: "Натисніть у ЦЕНТР фото.", images: [{ url: HOTSPOT_IMAGE, caption: "" }], zones: [{ x: 50, y: 50, r: 25 }], explanation: "Зона — коло в центрі фото." } },
              { order: 3, type: "ordering", title: "Порядок кроків", content: { lead: "Розставте кроки за порядком: Перший → Другий → Третій.", images: [], items: [{ text: "Перший крок" }, { text: "Другий крок" }, { text: "Третій крок" }], explanation: "Порядок: Перший, Другий, Третій." } },
              { order: 4, type: "matching", title: "Відповідність", content: { lead: "Зіставте число з його назвою.", images: [], pairs: [{ left: "Один", right: "1" }, { left: "Два", right: "2" }], explanation: "Один — 1, Два — 2." } },
            ],
          });
        if (k === 14) return stdModule(c, k, { module: { retryFreeAttempts: 0, retryCooldownHours: 1 }, note: "У цього модуля **свій** гейт пересдачі: 0 вільних спроб, пауза 1 година — перекриває курс." });
        if (k === 15)
          return stdModule(c, k, {
            note: "Тут **2 питання**, а поріг курсу — **100%**: одна помилка = модуль провалено (сценарій провалу й пересдачі).",
            questions: [quiz(1, "Питання 1 з 2: правильна відповідь — «Так, саме так»?", yes), quiz(2, "Питання 2 з 2: правильна відповідь — «Так, саме так»?", yes)],
          });
        return stdModule(c, k);
      }),
    },
  };
}

// Коли курс «призначено»: зсув назад — щоб на старті вже були стани
// «відстаєте» (м'який графік) і «прострочено» (жорсткий дедлайн).
const ASSIGNMENT_PLAN = [
  { build: courseMechanics5, assignedDaysAgo: 0 },
  { build: courseMechanics10, assignedDaysAgo: 5 },
  { build: courseMechanics15, assignedDaysAgo: 25 },
];

async function removeEnrollments(where, label) {
  const rows = await prisma.enrollment.findMany({ where, select: { id: true, employeeId: true, course: { select: { slug: true } } } });
  if (rows.length === 0) return 0;
  console.log(`  - ${label}: знімаємо ${rows.length} призначень (${rows.map((r) => r.course.slug).join(", ")})`);
  if (DRY_RUN) return rows.length;
  await prisma.$transaction([
    // RatingEvent без FK — прибираємо бали за ці призначення самі (те саме,
    // що робить syncEnrollmentEvents після DELETE в адмінці).
    prisma.ratingEvent.deleteMany({ where: { refType: "enrollment", refId: { in: rows.map((r) => r.id) } } }),
    prisma.enrollment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } }),
  ]);
  return rows.length;
}

async function main() {
  const employee = await prisma.employee.findFirst({ where: { externalCode: { equals: EMPLOYEE_CODE, mode: "insensitive" } }, select: { id: true, externalCode: true, name: true } });
  if (!employee) throw new Error(`Співробітника ${EMPLOYEE_CODE} не знайдено`);
  const admin = await prisma.employee.findFirstOrThrow({ where: { externalCode: SYSTEM_ADMIN_EXTERNAL_CODE }, select: { id: true } });
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Стенд для ${employee.externalCode} (${employee.name}, id ${employee.id})`);

  console.log("1. Призначення співробітника:");
  await removeEnrollments({ employeeId: employee.id }, employee.externalCode);

  const slugs = [...LEGACY_TEST_SLUGS, ...ASSIGNMENT_PLAN.map((p) => p.build().slug)];
  console.log("2. Старі тестові курси:");
  for (const slug of slugs) {
    const course = await prisma.course.findUnique({ where: { slug }, select: { id: true, title: true } });
    if (!course) continue;
    await removeEnrollments({ courseId: course.id }, `«${course.title}»`);
    console.log(`  - видаляємо курс «${course.title}» (модулі/екрани/компоненти — каскадом)`);
    if (!DRY_RUN) await prisma.course.delete({ where: { id: course.id } });
  }

  console.log("3. Створення й призначення:");
  for (const plan of ASSIGNMENT_PLAN) {
    const data = plan.build();
    const assignedAt = daysAgo(plan.assignedDaysAgo);
    const dueDate = addDays(assignedAt, data.deadlineDays);
    const overdue = dueDate < new Date();
    console.log(`  - «${data.title}»: ${data.modules.create.length} модулів, призначено ${plan.assignedDaysAgo} дн. тому, дедлайн ${dueDate.toISOString().slice(0, 10)}${overdue ? " (ВЖЕ ПРОСТРОЧЕНО)" : ""}`);
    if (DRY_RUN) continue;
    const course = await prisma.course.create({ data, select: { id: true } });
    await prisma.enrollment.create({
      data: { employeeId: employee.id, courseId: course.id, assignedById: admin.id, assignedAt, dueDate, isMandatory: data.isMandatory, status: overdue ? "overdue" : "not_started" },
    });
  }
  console.log(DRY_RUN ? "Нічого не записано." : "Готово.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
