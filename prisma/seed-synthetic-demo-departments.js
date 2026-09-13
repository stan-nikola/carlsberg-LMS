// ДОДАТКОВИЙ seed — дозаповнює вже створену синтетичну demo-базу (див.
// seed-synthetic-demo.js) трьома новими "департаментами" (виробництво/
// HR/маркетинг), узгодженими раніше: проста 2-рівнева ієрархія (керівник
// департаменту -> лінійні співробітники), приблизно по 300 на кожен.
// Не чіпає вже створену структуру продажів (RM/ASM/SV/поле) — лише
// додає нові записи поверх неї. Той самий безпековий принцип, що й
// seed-synthetic-demo.js: читає ОКРЕМУ SYNTHETIC_DEMO_DATABASE_URL, не
// звичайну DATABASE_URL.
require("dotenv/config");
const { PrismaClient } = require("../app/generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const connectionString = process.env.SYNTHETIC_DEMO_DATABASE_URL;
if (!connectionString) {
  console.error("Помилка: не задано SYNTHETIC_DEMO_DATABASE_URL у .env.");
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

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
// seed починається з 900000, щоб гарантовано не перетнутись з
// seed-лічильником у seed-synthetic-demo.js (там seed йшов з employee.id,
// їх там 740 — з великим запасом).
let seedCounter = 900000;
function randomIdentity() {
  const s = seedCounter++;
  const first = FIRST_NAMES[s % FIRST_NAMES.length];
  const last = LAST_NAMES[(s * 7 + 3) % LAST_NAMES.length];
  return { name: `${first} ${last}`, email: `${translit(first)}.${translit(last)}${s}@example-fmcg.test` };
}
function randomHireDate() {
  const now = Date.now();
  const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
  return new Date(now - Math.random() * tenYearsMs);
}
function pad4(n) {
  return String(n).padStart(4, "0");
}

const DEPARTMENTS = [
  { key: "PR", label: "Виробництво", headCode: "PR_HEAD", headTitle: "Керівник виробництва", staffCode: "PR_STAFF", staffTitle: "Оператор виробничої лінії", total: 300 },
  { key: "HR", label: "HR", headCode: "HR_HEAD", headTitle: "Керівник HR-департаменту", staffCode: "HR_STAFF", staffTitle: "HR-менеджер", total: 300 },
  { key: "MK", label: "Маркетинг", headCode: "MK_HEAD", headTitle: "Керівник маркетингу", staffCode: "MK_STAFF", staffTitle: "Спеціаліст з маркетингу", total: 300 },
];

async function main() {
  console.log("Додаю 3 нові департаменти до вже існуючої demo-бази...");
  let createdCount = 0;

  for (const dept of DEPARTMENTS) {
    const posHead = await prisma.position.upsert({
      where: { code: dept.headCode }, update: {},
      create: { code: dept.headCode, name: dept.headTitle, level: 1 },
    });
    const posStaff = await prisma.position.upsert({
      where: { code: dept.staffCode }, update: {},
      create: { code: dept.staffCode, name: dept.staffTitle, level: 2 },
    });

    const headIdentity = randomIdentity();
    const headEmployee = await prisma.employee.create({
      data: {
        name: headIdentity.name,
        email: headIdentity.email,
        role: "employee",
        externalCode: `${dept.key}0001`,
        positionId: posHead.id,
        territoryId: null, // департаменти не прив'язані до збутової територіальної ієрархії
        managerId: null,
        isActive: true,
        firstLoginAt: null,
        createdAt: randomHireDate(),
      },
    });
    createdCount++;

    for (let i = 2; i <= dept.total; i++) {
      const identity = randomIdentity();
      await prisma.employee.create({
        data: {
          name: identity.name,
          email: identity.email,
          role: "employee",
          externalCode: `${dept.key}${pad4(i)}`,
          positionId: posStaff.id,
          territoryId: null,
          managerId: headEmployee.id,
          isActive: true,
          firstLoginAt: null,
          createdAt: randomHireDate(),
        },
      });
      createdCount++;
    }
    console.log(`  ${dept.label}: ${dept.total} співробітників`);
  }

  console.log(`Готово: додано ${createdCount} нових співробітників (3 департаменти).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
