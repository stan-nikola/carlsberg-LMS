// ОДНОРАЗОВИЙ demo/тестовий seed — НЕ для продакшн-БД.
//
// Наповнює ПОВНІСТЮ ПОРОЖНЮ базу вигаданою організаційною структурою
// (жодних реальних людей/імейлів): 4 RM -> 4 ASM кожен (16) -> 5 SV кожен
// (80) -> 8 польових на SV (3 ТП + 3 мерчендайзери + 2 техніки = 640).
// Разом ~740 співробітників. Одна SV-посада вручну прив'язана до
// реальної пошти користувача (тестовий логін), решта — повністю
// синтетичні.
//
// БЕЗПЕКА: свідомо читає ОКРЕМУ змінну SYNTHETIC_DEMO_DATABASE_URL, а не
// звичайну DATABASE_URL з .env — щоб цей скрипт фізично не міг випадково
// накотитись на продакшн-базу, поки хтось свідомо не пропише саме цю
// окрему змінну в .env, вказуючи на НОВУ (порожню) Neon-базу.
require("dotenv/config");
const { PrismaClient } = require("../app/generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const connectionString = process.env.SYNTHETIC_DEMO_DATABASE_URL;
if (!connectionString) {
  console.error(
    "Помилка: не задано SYNTHETIC_DEMO_DATABASE_URL у .env.\n" +
      "Це навмисно ОКРЕМА змінна від DATABASE_URL, щоб цей скрипт не міг\n" +
      "випадково записати вигадані дані в реальну продакшн-базу.\n" +
      "Додай у .env рядок:\n" +
      '  SYNTHETIC_DEMO_DATABASE_URL="postgresql://...<нова порожня Neon-база>..."\n' +
      "і запусти скрипт знову."
  );
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// --- Налаштування тестового логіну (SV Харків 1 отримає цю пошту) ---
const TEST_LOGIN_EMAIL = "stanislav.karmanov1@gmail.com";

const RM_REGIONS = ["Західний", "Південний", "Північно-Східний", "Центральний"];
const OBLAST_CENTERS = [
  "Харків", "Одеса", "Львів", "Дніпро", "Запоріжжя", "Вінниця", "Полтава",
  "Черкаси", "Житомир", "Суми", "Чернігів", "Хмельницький", "Рівне",
  "Івано-Франківськ", "Тернопіль", "Луцьк",
];
const FIRST_NAMES = [
  "Олег", "Сергій", "Андрій", "Максим", "Дмитро", "Павло", "Роман", "Богдан",
  "Ігор", "Тарас", "Юрій", "Віталій", "Артем", "Костянтин", "Микола",
  "Олена", "Наталія", "Ірина", "Марія", "Тетяна", "Вікторія", "Оксана",
];
const LAST_NAMES = [
  "Мельник", "Шевченко", "Бондаренко", "Коваленко", "Ткаченко", "Кравченко",
  "Олійник", "Шевчук", "Поліщук", "Бойко", "Гончар", "Марченко", "Савченко",
  "Лисенко", "Руденко", "Пилипенко", "Литвин", "Кузьменко", "Гуменюк",
];
const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "h", д: "d", е: "e", є: "ie", ж: "zh", з: "z",
  и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
  ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia",
};
function translit(word) {
  return word.toLowerCase().split("").map((ch) => TRANSLIT[ch] ?? ch).join("");
}
let seed = 1;
function nextSeed() {
  return seed++;
}
function randomIdentity() {
  const s = nextSeed();
  const first = FIRST_NAMES[s % FIRST_NAMES.length];
  const last = LAST_NAMES[(s * 7 + 3) % LAST_NAMES.length];
  return { name: `${first} ${last}`, email: `${translit(first)}.${translit(last)}${s}@example-fmcg.test` };
}
function randomHireDate() {
  // "рандомні дати влаштування від 10 років" — в межах останніх 10 років.
  // Немає окремого поля "дата працевлаштування" в схемі (лише createdAt/
  // firstLoginAt) — свідомо НЕ додаю нове поле в спільну схему (це
  // вплинуло б і на реальну продакшн-БД через ту саму schema.prisma), а
  // переиспользую createdAt під це значення саме тут, у синтетичному
  // датасеті. Якщо потрібне окреме реальне поле в схемі — це наступний
  // крок через /db-migrate, за окремим підтвердженням.
  const now = Date.now();
  const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
  return new Date(now - Math.random() * tenYearsMs);
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pad4(n) {
  return String(n).padStart(4, "0");
}

async function main() {
  console.log("Наповнення синтетичної demo-бази...");

  // --- Positions (лише основна гілка HoReCa-продажів — без RKA/LKAM/FSM MT) ---
  const posRM = await prisma.position.upsert({
    where: { code: "RM_HORECA" }, update: {},
    create: { code: "RM_HORECA", name: "RM HoReCa", level: 1 },
  });
  const posASM = await prisma.position.upsert({
    where: { code: "ASM" }, update: {},
    create: { code: "ASM", name: "ASM", level: 2 },
  });
  const posSV = await prisma.position.upsert({
    where: { code: "SV" }, update: {},
    create: { code: "SV", name: "SV", level: 3 },
  });
  const posSR = await prisma.position.upsert({
    where: { code: "SR" }, update: {},
    create: { code: "SR", name: "Торговий представник (ТП)", level: 4 },
  });
  const posTECH = await prisma.position.upsert({
    where: { code: "TECH_HORECA" }, update: {},
    create: { code: "TECH_HORECA", name: "Технік HoReCa", level: 4 },
  });
  const posMR = await prisma.position.upsert({
    where: { code: "MR_TT" }, update: {},
    create: { code: "MR_TT", name: "Мерчендайзер ТТ", level: 5 },
  });

  let externalCodeCounters = { RM: 0, ASM: 0, SV: 0, SR: 0, TECH: 0, MR: 0 };
  function nextExternalCode(prefix) {
    externalCodeCounters[prefix] += 1;
    return `${prefix}${pad4(externalCodeCounters[prefix])}`;
  }

  const oblastPool = shuffle(OBLAST_CENTERS);
  let oblastIdx = 0;
  let testEmailAssigned = false;
  let createdCount = 0;

  for (const regionName of RM_REGIONS) {
    // --- RM territory + employee ---
    const rmTerritory = await prisma.territory.create({
      data: { name: `RM ${regionName} регіон`, parentId: null },
    });
    const rmIdentity = randomIdentity();
    const rmEmployee = await prisma.employee.create({
      data: {
        name: rmIdentity.name,
        email: rmIdentity.email,
        role: "employee",
        externalCode: nextExternalCode("RM"),
        positionId: posRM.id,
        territoryId: rmTerritory.id,
        managerId: null,
        isActive: true,
        firstLoginAt: null, // "зареєстрований на платформі" = FALSE для всіх
        createdAt: randomHireDate(),
      },
    });
    createdCount++;

    for (let a = 0; a < 4; a++) {
      // --- ASM territory (випадкова назва обласного центру) + employee ---
      const oblast = oblastPool[oblastIdx % oblastPool.length];
      oblastIdx++;
      const asmTerritory = await prisma.territory.create({
        data: { name: `ASM ${oblast} область`, parentId: rmTerritory.id },
      });
      const asmIdentity = randomIdentity();
      const asmEmployee = await prisma.employee.create({
        data: {
          name: asmIdentity.name,
          email: asmIdentity.email,
          role: "employee",
          externalCode: nextExternalCode("ASM"),
          positionId: posASM.id,
          territoryId: asmTerritory.id,
          managerId: rmEmployee.id,
          isActive: true,
          firstLoginAt: null,
          createdAt: randomHireDate(),
        },
      });
      createdCount++;

      for (let s = 0; s < 5; s++) {
        // --- SV territory + employee ---
        const svTerritory = await prisma.territory.create({
          data: { name: `SV ${oblast} ${s + 1}`, parentId: asmTerritory.id },
        });
        const svIdentity = randomIdentity();
        const isTestAccount = !testEmailAssigned && svTerritory.name === `SV ${OBLAST_CENTERS[0]} 1`;
        const svEmail = isTestAccount ? TEST_LOGIN_EMAIL : svIdentity.email;
        const svName = isTestAccount ? "Станіслав Карманов" : svIdentity.name;
        if (isTestAccount) testEmailAssigned = true;

        const svEmployee = await prisma.employee.create({
          data: {
            name: svName,
            email: svEmail,
            role: "employee",
            externalCode: nextExternalCode("SV"),
            positionId: posSV.id,
            territoryId: svTerritory.id,
            managerId: asmEmployee.id,
            isActive: true,
            firstLoginAt: null,
            createdAt: randomHireDate(),
          },
        });
        createdCount++;

        // --- 8 польових під цим SV: 3 ТП + 3 мерчендайзери + 2 техніки ---
        // Польові ролі НЕ отримують особисту пошту (email: null) — той
        // самий принцип, що й у реальному імпорті (CLAUDE.md): PIN для
        // них іде на пошту керівника (svEmployee.email), не власну. Ім'я —
        // точно за prisma/import-employees.js:191 (`email ? nameFromEmail
        // (email) : title`): без email реальне ім'я НІКОЛИ не пишеться в
        // базу (воно живе лише в localStorage пристрою, lib/localName.js)
        // — Employee.name тут заглушка з назви посади, не вигадане ім'я.
        // territoryId НАВМИСНО не задається (лишається null) — так само,
        // як у реальному імпорті (CLAUDE.md: "імпорт зміг прив'язати їх
        // лише до цілого RM-регіону, не до конкретного SV-району"),
        // прив'язка йде виключно через managerId. Раніше тут стояло
        // svTerritory.id — зламало TerritoryPicker.jsx, який розрахований
        // рівно на ОДНУ відповідальну людину на SV-листку дерева; з
        // підлеглими на тій самій території їх ставало 9, і нікого з них
        // не можна було ні побачити, ні знайти пошуком (реальний баг,
        // знайдений і виправлений користувачем).
        const fieldSpecs = [
          ...Array(3).fill({ pos: posSR, prefix: "SR" }),
          ...Array(3).fill({ pos: posMR, prefix: "MR" }),
          ...Array(2).fill({ pos: posTECH, prefix: "TECH" }),
        ];
        for (const spec of fieldSpecs) {
          await prisma.employee.create({
            data: {
              name: spec.pos.name,
              email: null,
              role: "employee",
              externalCode: nextExternalCode(spec.prefix),
              positionId: spec.pos.id,
              territoryId: null,
              managerId: svEmployee.id,
              isActive: true,
              firstLoginAt: null,
              createdAt: randomHireDate(),
            },
          });
          createdCount++;
        }
      }
    }
  }

  console.log(`Готово: створено ${createdCount} співробітників.`);
  console.log(`Тестовий логін: SV ${OBLAST_CENTERS[0]} 1 -> ${TEST_LOGIN_EMAIL}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
