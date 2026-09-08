// Наповнює БД реальним контентом курсу «Асортимент», перенесеним з
// legacy/course-assortment.html (інфо-екрани 1-8 + всі 16 питань квізу
// з 5 блоків: categories/segments/shelf/packaging/specs). Акордеони,
// gate, streak-конфеті — свідомо не переносили (MVP-рішення при
// плануванні цього кроку); текст акордеонів зберігся як note (завжди
// видима підказка, без click-to-reveal).
//
// Запуск: npx prisma db seed (після того як prisma migrate dev
// створить таблиці — сам скрипт БД не мігрує).

require("dotenv/config");
const { PrismaClient } = require("../app/generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function infoLesson(order, title, content) {
  return { type: "info", order, title, content };
}

function quizLesson(order, title, questionType, options) {
  return { type: "quiz", order, title, content: { questionType, options } };
}

// externalCode должен совпадать с SYSTEM_ADMIN_EXTERNAL_CODE в
// lib/adminAuth.js — "актор" для Enrollment.assignedById, когда курс
// назначают через /admin (отдельный вход по паролю, без employee-сессии,
// так что писать реального Employee.id неоткуда).
const SYSTEM_ADMIN_EXTERNAL_CODE = "SYSTEM-ADMIN";

async function seedSystemAdmin() {
  const employee = await prisma.employee.upsert({
    where: { externalCode: SYSTEM_ADMIN_EXTERNAL_CODE },
    update: {},
    create: {
      externalCode: SYSTEM_ADMIN_EXTERNAL_CODE,
      name: "Система (Адмін-панель)",
      role: "admin",
    },
  });
  console.log("Seeded system admin employee:", employee.externalCode, "(id", employee.id + ")");
}

async function main() {
  await seedSystemAdmin();

  // Курс -> Блок -> Модуль -> Екран (див. schema.prisma). "Асортимент" —
  // перший блок курсу "Адаптація мерчендайзерів"; надалі до цього ж курсу
  // додаються ще блоки (вручну через /admin, не тут).
  const course = await prisma.course.upsert({
    where: { slug: "merchandiser-adaptation" },
    update: {},
    create: {
      slug: "merchandiser-adaptation",
      title: "Адаптація мерчендайзерів",
      description: null,
      isMandatory: true,
      deadlineDays: 14,
      blocks: {
        create: [
          {
            title: "Асортимент",
            order: 1,
            modules: {
              create: [
                {
                  title: "Категорії та бренди",
                  order: 1,
            lessons: {
              create: [
                infoLesson(1, "Carlsberg Ukraine сьогодні", {
                  kicker: "ПРО КОМПАНІЮ",
                  body: "Три пивоварні — **Львівська** (з 1715 року), **Київська** (з 2004) і **Запорізька** (з 1974) — випускають понад **202 SKU** під **16 брендами**: від пива і сидру до кваса та безалкогольних напоїв.",
                  images: [{ url: "/assets/assortment-production.jpg", caption: "" }],
                  note: "Асортимент — це те, що ви щодня пропонуєте клієнту. Знання категорій, брендів, тари і термінів придатності допомагає впевнено відповідати на запитання ОПР і уникати помилок у замовленні.",
                }),
                infoLesson(2, "Шість категорій продукції", {
                  kicker: "КАТЕГОРІЇ ПРОДУКЦІЇ",
                  lead: "Carlsberg Ukraine — лідер одразу в кількох категоріях. Придивіться, які бренди очолюють кожну з них.",
                  images: [{ url: "/assets/assortment-leadership.jpg", caption: "" }],
                  body: "Категорії: **Пиво**, **Сидр**, **Квас**, **Смакове пиво**, **AFB** (Alcohol Free Beverages — безалкогольні напої: пиво 0.0%, квас, «Лісовий розмай» тощо) і **Енергетичні напої**.",
                  note: "AFB (Alcohol Free Beverages) — це парасолькова категорія безалкогольних напоїв: безалкогольне пиво (Carlsberg 0, Львівське 1715 безалкогольне), безалкогольний квас (Квас Тарас) і напої на кшталт «Лісовий розмай». Це не «безалкогольне пиво» окремо — це ширша категорія.",
                }),
                infoLesson(3, "Портфель брендів", {
                  kicker: "ПОРТФЕЛЬ БРЕНДІВ",
                  lead: "Усі бренди Carlsberg Ukraine діляться на чотири групи.",
                  images: [{ url: "/assets/assortment-portfolio.jpg", caption: "" }],
                  body: "**Локальні пивні бренди** — Львівське, Розмивне, Арсенал, Ice Mix, Корабельне. **Ліцензійні пивні бренди** — Carlsberg, Tuborg, Kronenbourg 1664 Blanc, Seth&Riley's Garage, Holsten, Staropramen, Miller. **Імпорт** — Grimbergen, Harp, Kilkenny, Warsteiner, Guinness. **Непиво** — Somersby (сидр), Dolcelini, Квас Тарас, «Лісовий розмай», Battery.",
                  note: "Усі три позиції-лідери в категорії «Сидр» (55.4% частки ринку) — це варіанти бренду Somersby. Де Сад, Львівське Radler, Garage Hardcore та Apps до категорії сидру не належать.",
                }),
                quizLesson(4, "Бренди категорії сидр", "single", [
                  { text: "Де Сад", correct: false },
                  { text: "Львівське Radler", correct: false },
                  { text: "Garage Hardcore", correct: false },
                  { text: "Somersby", correct: true },
                  { text: "Apps", correct: false },
                ]),
                quizLesson(5, "Категорія бренду Garage", "single", [
                  { text: "Пиво", correct: true },
                  { text: "Сидр", correct: false },
                  { text: "Безалкогольні напої", correct: false },
                  { text: "Слабоалкогольні міксовані напої", correct: false },
                ]),
                quizLesson(
                  6,
                  "Як правильно визначити категорію, що об’єднує наступні бренди: Квас Тарас, Львівське 1715 безалкогольне, Carlsberg безалкогольне, «Лісовий розмай»?",
                  "single",
                  [
                    { text: "Безалкогольні напої (alcohol free beverages - AFB)", correct: true },
                    { text: "Безалкогольне пиво", correct: false },
                    { text: "Напої", correct: false },
                  ]
                ),
              ],
            },
          },
          {
            title: "Цінові сегменти",
            order: 2,
            lessons: {
              create: [
                infoLesson(1, "П'ять цінових сегментів", {
                  kicker: "ЦІНОВІ СЕГМЕНТИ",
                  lead: "Кожен бренд у портфелі належить до одного з п'яти цінових сегментів — від преміального імпорту до низького цінового.",
                  body: "1. **Супер-преміальний імпорт** (Import Super Premium)\n\n2. **Супер-преміум** (Super Premium)\n\n3. **Преміальний** (Premium)\n\n4. **Середній ціновий** (Mainstream)\n\n5. **Низький ціновий** (Lower Mainstream)\n\nСегмент визначає позиціонування бренду на полиці й у розмові з клієнтом — від нього залежить цінова політика і цільова аудиторія SKU.",
                  note: "Розуміння цінового сегменту допомагає підібрати правильну аргументацію під час презентації клієнту та уникнути помилок при формуванні асортиментної матриці торгової точки.",
                }),
                quizLesson(2, "SKU середнього цінового сегменту (mainstream)", "multi", [
                  { text: "Львівське світле", correct: true },
                  { text: "Львівське 1715", correct: true },
                  { text: "Tuborg", correct: true },
                  { text: "Арсенал", correct: false },
                  { text: "Holsten", correct: false },
                ]),
                quizLesson(3, "Ціновий сегмент Kronenbourg blanc 1664", "single", [
                  { text: "Супер-преміальний імпорт (Import Super Premium)", correct: false },
                  { text: "Супер-преміум (Super Premium)", correct: false },
                  { text: "Преміальний (Premium)", correct: true },
                  { text: "Середній ціновий (Mainstream)", correct: false },
                  { text: "Низький ціновий (Lower Mainstream)", correct: false },
                ]),
                quizLesson(4, "Ціновий сегмент Carlsberg", "single", [
                  { text: "Супер-преміальний імпорт (Import Super Premium)", correct: false },
                  { text: "Супер-преміум (Super Premium)", correct: false },
                  { text: "Преміальний (Premium)", correct: true },
                  { text: "Середній ціновий (Mainstream)", correct: false },
                  { text: "Низький ціновий (Lower Mainstream)", correct: false },
                ]),
              ],
            },
          },
          {
            title: "Терміни придатності",
            order: 3,
            lessons: {
              create: [
                infoLesson(1, "Термін придатності залежить від тари", {
                  kicker: "ТЕРМІНИ ПРИДАТНОСТІ",
                  lead: "Скло зберігає продукт найдовше, ПЕТ — коротше, а розкрита кега має найкоротший термін.",
                  body: "У **ПЕТ-тарі** термін зберігання зазвичай менший, ніж у склі чи банці — ПЕТ пропускає більше кисню й ароматичних сполук. Пиво в **КЕЗІ** (PET-кег системі для розливного пива) має обмежений термін свіжості. Після **відкриття кеги** пиво потрібно реалізувати за короткий строк — контакт із повітрям і мікрофлорою пришвидшує псування.",
                  note: "Прострочена продукція на полиці — це репутаційний ризик і втрата довіри клієнта. Завжди перевіряйте дати виробництва під час зняття залишків і формування замовлення.",
                }),
                quizLesson(2, "Термін придатності пива у КЕЗІ", "single", [
                  { text: "3 місяці", correct: false },
                  { text: "4 місяці", correct: true },
                  { text: "6 місяців", correct: false },
                  { text: "12 місяців", correct: false },
                ]),
                quizLesson(3, "Термін придатності пива після відкриття КЕГИ", "single", [
                  { text: "2 дні", correct: false },
                  { text: "1 тиждень", correct: true },
                  { text: "3 тижні", correct: false },
                ]),
                quizLesson(4, "Термін придатності продукту у ПЕТ тарі", "single", [
                  { text: "3 місяці", correct: false },
                  { text: "4 місяці", correct: false },
                  { text: "6 місяців", correct: true },
                  { text: "12 місяців", correct: false },
                ]),
              ],
            },
          },
          {
            title: "Тара і формати",
            order: 4,
            lessons: {
              create: [
                infoLesson(1, "Чотири типи тари", {
                  kicker: "ТАРА І ФОРМАТИ",
                  images: [{ url: "/assets/assortment-packaging-types.jpg", caption: "" }],
                  body: "**Скляні пляшки** — нейтральні для смаку, газонепроникні, багаторазові. **Алюмінієві банки** — легкі, не б'ються, швидко охолоджуються. **ПЕТ-пляшки** — легкі, без бою, але газопроникні. **Кеги і ПЕТ-кеги** — для розливного пива, зберігають ідеальну температуру подачі 3–5°C.",
                  note: "Скло — найкраще зберігає смак, але важке і б’ється. Банка — легка, не пропускає світло, але дорожча за пляшку. ПЕТ — найлегший і найдешевший, але пропускає кисень і ароматичні речовини, тому термін придатності коротший.",
                }),
                infoLesson(2, "Приклади формату по SKU", {
                  kicker: "ПРИКЛАДИ ТАРИ",
                  lead: "Один і той самий бренд часто виходить одразу в кількох форматах тари.",
                  images: [
                    { url: "/assets/assortment-pack-glass.png", caption: "Скло · Львівське 1715" },
                    { url: "/assets/assortment-pack-can.png", caption: "Банка · Львівське Різдвяне" },
                    { url: "/assets/assortment-pack-pet.png", caption: "ПЕТ · Львівське 1715" },
                    { url: "/assets/assortment-pack-keg.png", caption: "Кег на візку" },
                  ],
                  note: "Скляна пляшка і банка частіше йдуть у роздрібну торгівлю (off-trade), кег і ПЕТ-кег — у HoReCa та точки розливного пива (on-trade).",
                }),
                quizLesson(3, "SKU у форматі залізної банки", "multi", [
                  { text: "Арсенал світле", correct: false },
                  { text: "Holsten i", correct: false },
                  { text: "Арсенал міцне", correct: false },
                  { text: "Лев темне", correct: false },
                  { text: "Tuborg", correct: true },
                  { text: "Львівське М’яке", correct: false },
                  { text: "Carlsberg", correct: true },
                  { text: "Ice Mix lime", correct: false },
                ]),
                quizLesson(4, "Об’єм залізної банки Львівське 1715 безалкогольне", "single", [
                  { text: "0,45 л", correct: false },
                  { text: "0,48 л", correct: false },
                  { text: "0,50 л", correct: true },
                  { text: "0,56 л", correct: false },
                ]),
                quizLesson(5, "Безалкогольне SKU бренду Warsteiner", "single", [
                  { text: "Warsteiner premium Verum", correct: false },
                  { text: "Warsteiner premium Fresh", correct: true },
                  { text: "Warsteiner double hopped", correct: false },
                  { text: "Warsteiner Brewers Gold", correct: false },
                ]),
              ],
            },
          },
          {
            title: "Характеристики SKU",
            order: 5,
            lessons: {
              create: [
                infoLesson(1, "Основні одиниці виміру", {
                  kicker: "ОДИНИЦІ ВИМІРУ",
                  body: "**1 дал** = 10 літрів = 20 пляшок 0,5 л = 30 пляшок 0,33 л\n\n**10 дал** = 1 гектолітр (Hl)\n\n**10 000 дал** = 1 кілогектолітр (kHl)\n\nЦі одиниці використовуються в звітах про обсяги продажів, планограмах і при обговоренні плану-факту з КАМ.",
                  note: "Кожен SKU має свій вміст спирту (ABV) і належить до певного стилю пива — лагер, портер, пшеничне тощо. Ці характеристики часто відрізняють схожі на вигляд продукти одного бренду.",
                }),
                quizLesson(2, "Найнижчий (3,5%) вміст спирту", "single", [
                  { text: "Айс мікс Лайм", correct: true },
                  { text: "Львівське світле", correct: false },
                  { text: "Львівське різдвяне", correct: false },
                  { text: "Корабельне", correct: false },
                ]),
                quizLesson(3, "Найвищий (8%) вміст спирту", "multi", [
                  { text: "Львівське портер", correct: true },
                  { text: "Арсенал міцне", correct: true },
                  { text: "Carlsberg", correct: false },
                  { text: "Garage Hardcore", correct: true },
                ]),
                quizLesson(4, "Бренд без б/а SKU в Україні", "single", [
                  { text: "Tuborg", correct: false },
                  { text: "Carlsberg", correct: false },
                  { text: "Львівське", correct: false },
                  { text: "Garage", correct: false },
                  { text: "Kronenbourg 1664", correct: true },
                ]),
                quizLesson(5, "SKU пшеничного типу пива", "multi", [
                  { text: "Львівське Білий Лев 0,5 л", correct: true },
                  { text: "Kronenbourg 1664 Blanc 0.46 л", correct: true },
                  { text: "Holsten пет 1,12 л", correct: false },
                  { text: "Carlsberg Pilsner 0,5 л", correct: false },
                ]),
              ],
            },
          },
        ],
      },
        }],
      },
    },
  });

  console.log("Seeded course:", course.slug, "(id", course.id + ")");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
