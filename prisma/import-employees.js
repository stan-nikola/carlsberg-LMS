// Импорт оргструктуры отдела продаж из
// "02_03_Атрибути_співробітників_відділу_продажів.xlsx" (лист "Simple
// Table" — лист "ChM" (торговый маркетинг) НЕ импортируется, это другая
// ветка оргструктуры, за рамками курсов для полевых продаж).
//
// Правило по email: реальная личная почта есть только у "менеджерского"
// слоя должностей. Какие именно должности это — определено НЕ вручную,
// а по факту в самих данных: посчитана доля уникальных email на каждый
// "Тип посади"; у SV/ASM/LKAM/RM HoReCa/FSM MT/SV RKA/ТП RKA она ~0.9-1.0
// (реальные разные люди), у МЧ ТТ/Технік HoReCa UA/Торговые представители/
// МЧ RKA — 0.08-0.53 (много строк делят один и тот же email, это email
// РУКОВОДИТЕЛЯ на вакантный/безымянный слот, не личная почта). Первая
// версия этого скрипта ограничивалась только SV/ASM/LKAM/RM HoReCa (так
// было прочитано первое уточнение пользователя) — это дало 534 из 761
// нерезолвленных managerId именно на МЧ RKA, потому что их email
// указывал на SV RKA, а SV RKA ошибочно не считался менеджерским типом.
// Порог 0.7 отделяет чётко, без пограничных случаев (ближайшие — ТП RKA
// 0.90 и МЧ ТТ 0.53).
//
// У "менеджерского" слоя Employee.email = их реальная почта. У всех
// остальных — Employee.email = null, Employee.externalCode = "Код
// посади" (100% уникален в файле), managerId резолвится по совпадению
// их "E Mail" с email кого-то из менеджерского слоя.
//
// Для самого менеджерского слоя managerId восстановлен ЭВРИСТИКОЙ по
// территории (см. resolveManagerTierManager) — прямой ссылки "кто чей
// руководитель" в файле нет вообще. Работает для основной ветки
// (ASM->RM HoReCa, SV->ASM по совпадению Регіон). НЕ работает для
// FSM MT/SV RKA/ТП RKA (параллельная "SFSM MT Україна" ветка — регион
// зашит в текст "Посада", а не в колонку "Регіон", группировать по
// колонке region бессмысленно) — их managerId сознательно оставлен
// null, это ~44 записи, руками через Prisma Studio дорезолвить быстрее,
// чем гадать по тексту должности.
//
// Имя (Employee.name) для менеджерского слоя выводится из email
// (Ivan.Petrenko@carlsberg.ua -> "Ivan Petrenko"); для остальных —
// personal-имени в файле просто нет, используется "Посада" (описание
// должности/территории) как единственный доступный ярлык.
//
// Запуск: node prisma/import-employees.js "<путь к xlsx>"

require("dotenv/config");
const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("../app/generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

// Доля уникальных email в строках этого типа, выше которой считаем тип
// "менеджерским" (реальная личная почта, не дубль на руководителя).
const MANAGER_TIER_UNIQUE_RATIO_THRESHOLD = 0.7;

function computeManagerTypes(dataRows, col) {
  const byType = new Map();
  for (const r of dataRows) {
    const type = r[col.type];
    const email = String(r[col.email]).trim().toLowerCase();
    if (!byType.has(type)) byType.set(type, []);
    if (email) byType.get(type).push(email);
  }
  const managerTypes = new Set();
  for (const [type, emails] of byType) {
    const ratio = emails.length ? new Set(emails).size / emails.length : 0;
    if (ratio > MANAGER_TIER_UNIQUE_RATIO_THRESHOLD) managerTypes.add(type);
  }
  return managerTypes;
}

// code/level — level тут чисто описательный (иерархия реально строится
// через managerId, не через level — см. lib/permissions.js).
const POSITION_DEFS = [
  { raw: "RM HoReCa", code: "RM_HORECA", name: "RM HoReCa", level: 1 },
  { raw: "ASM", code: "ASM", name: "ASM", level: 2 },
  { raw: "LKAM", code: "LKAM", name: "LKAM", level: 2 },
  { raw: "SV", code: "SV", name: "SV", level: 3 },
  { raw: "SV RKA", code: "SV_RKA", name: "SV RKA", level: 3 },
  { raw: "FSM MT", code: "FSM_MT", name: "FSM MT", level: 3 },
  { raw: "Технік HoReCa UA", code: "TECH_HORECA", name: "Технік HoReCa", level: 4 },
  { raw: "Торговые представители", code: "SR", name: "Торговий представник (ТП)", level: 4 },
  { raw: "ТП RKA", code: "SR_RKA", name: "Торговий представник RKA", level: 4 },
  { raw: "МЧ TT", code: "MR_TT", name: "Мерчендайзер ТТ", level: 5 },
  { raw: "МЧ RKA", code: "MR_RKA", name: "Мерчендайзер RKA", level: 5 },
];

function nameFromEmail(email) {
  const local = email.split("@")[0];
  return local
    .split(/[._]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node prisma/import-employees.js <path-to-xlsx>");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const wb = XLSX.readFile(path.resolve(filePath));
  const sheet = wb.Sheets["Simple Table"];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  // Строка 2 (индекс) - заголовок, данные с индекса 3.
  const dataRows = rows.slice(3).filter((r) => r.some((c) => c !== ""));
  console.log(`Прочитано строк данных: ${dataRows.length}`);

  const col = { region: 0, type: 1, code: 2, title: 3, email: 8 };

  const MANAGER_TYPES = computeManagerTypes(dataRows, col);
  console.log("Менеджерские типы (реальный email):", [...MANAGER_TYPES]);

  // ---- 1. Territory ----
  const regionNames = [...new Set(dataRows.map((r) => r[col.region]).filter(Boolean))];
  const territoryByName = new Map();
  for (const name of regionNames) {
    // Territory.name не @unique в схеме - вручную find-or-create.
    let territory = await prisma.territory.findFirst({ where: { name } });
    if (!territory) {
      territory = await prisma.territory.create({ data: { name } });
    }
    territoryByName.set(name, territory.id);
  }
  console.log(`Territory: ${territoryByName.size}`);

  // ---- 2. Position ----
  const positionByRaw = new Map();
  for (const def of POSITION_DEFS) {
    const position = await prisma.position.upsert({
      where: { code: def.code },
      update: {},
      create: { code: def.code, name: def.name, level: def.level },
    });
    positionByRaw.set(def.raw, position.id);
  }
  console.log(`Position: ${positionByRaw.size}`);

  // ---- 3. Employee, проход 1: создаём всех, без managerId ----
  let created = 0;
  let skippedNoPosition = 0;
  const rowMeta = []; // { externalCode, rawEmailCol, type, region }
  // Даже внутри "менеджерских" типов изредка 2 строки делят 1 email
  // (например, один человек на двух территориях ТП RKA) - Employee.email
  // уникален, поэтому первая строка с этим email "владеет" им, остальные
  // трактуются как дубль (резолвятся через email-match во 2 проходе,
  // как и обычные дубли на руководителя).
  const claimedEmails = new Set();

  for (const r of dataRows) {
    const region = r[col.region];
    const type = r[col.type];
    const code = String(r[col.code]);
    const title = r[col.title];
    const rawEmail = String(r[col.email]).trim().toLowerCase();

    const positionId = positionByRaw.get(type);
    if (!positionId) {
      skippedNoPosition++;
      continue;
    }

    const isManagerTier = MANAGER_TYPES.has(type);
    const canClaimEmail = isManagerTier && rawEmail && !claimedEmails.has(rawEmail);
    const email = canClaimEmail ? rawEmail : null;
    if (canClaimEmail) claimedEmails.add(rawEmail);
    const name = email ? nameFromEmail(email) : title;

    const data = {
      name,
      email,
      positionId,
      territoryId: territoryByName.get(region) ?? null,
    };
    await prisma.employee.upsert({
      where: { externalCode: code },
      update: data, // повторный запуск чинит уже созданные записи, не только новые
      create: { externalCode: code, ...data },
    });
    created++;
    rowMeta.push({ externalCode: code, rawEmail, type, region, isManagerTier: canClaimEmail });
  }
  console.log(`Employee создано/обновлено: ${created}, пропущено (нет Position): ${skippedNoPosition}`);

  // ---- 4. Employee, проход 2: managerId ----
  const allEmployees = await prisma.employee.findMany({
    select: { id: true, externalCode: true, email: true, territoryId: true, positionId: true },
  });
  const employeeByExternalCode = new Map(allEmployees.map((e) => [e.externalCode, e]));
  const employeeByEmail = new Map(allEmployees.filter((e) => e.email).map((e) => [e.email, e]));
  const positionIdByCode = new Map(POSITION_DEFS.map((d) => [d.code, positionByRaw.get(d.raw)]));

  let resolvedByEmail = 0;
  let resolvedByHeuristic = 0;
  let unresolved = 0;

  for (const meta of rowMeta) {
    const self = employeeByExternalCode.get(meta.externalCode);
    if (!self) continue;

    let managerId = null;

    if (!meta.isManagerTier) {
      // Надёжный путь: email в строке = email руководителя.
      const manager = employeeByEmail.get(meta.rawEmail);
      if (manager && manager.id !== self.id) {
        managerId = manager.id;
        resolvedByEmail++;
      }
    } else {
      // Эвристика по территории для менеджерского слоя (см. комментарий
      // в шапке файла — самое ненадёжное место импорта).
      const territoryId = self.territoryId;
      if (meta.type === "ASM" || meta.type === "LKAM") {
        const rmHoreca = allEmployees.find(
          (e) => e.positionId === positionIdByCode.get("RM_HORECA") && e.territoryId === territoryId
        );
        if (rmHoreca) managerId = rmHoreca.id;
      } else if (meta.type === "SV") {
        const asm = allEmployees.find(
          (e) => e.positionId === positionIdByCode.get("ASM") && e.territoryId === territoryId
        );
        if (asm) managerId = asm.id;
      }
      if (managerId) resolvedByHeuristic++;
    }

    if (managerId) {
      await prisma.employee.update({ where: { id: self.id }, data: { managerId } });
    } else if (meta.type === "RM HoReCa" || meta.type === "FSM MT") {
      // Верх своей ветки (основной или "SFSM MT Україна") - без менеджера
      // по определению, это не ошибка резолва.
    } else {
      unresolved++;
    }
  }

  console.log(`managerId по email руководителя (надёжно): ${resolvedByEmail}`);
  console.log(`managerId по территории (эвристика, менеджерский слой): ${resolvedByHeuristic}`);
  console.log(`Не удалось определить managerId: ${unresolved}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
