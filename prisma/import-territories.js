// Наполняет иерархию Territory (RM-регион -> ASM-область -> SV-район/
// город) и уточняет Employee.territoryId/managerId для ASM и SV из
// реальной кросс-таблицы "baseAsm.xlsx" (лист "Лист2" - тот же RM/ASM/
// SV/SR, что и в Sheet1, но без объёмных данных, чище для парсинга).
//
// Формат ячейки: "ASM Сумська область (Швидкий Олександр Михайлович)" -
// роль+территория идут в Territory.name КАК ОДНА СТРОКА ("ASM Сумська
// область"), имя в скобках НИКОГДА не пишется в базу (ни в Territory,
// ни в Employee.name) - только используется здесь, в момент импорта,
// чтобы сопоставить с уже существующим Employee по фамилии. Employee.name
// как и раньше берётся только из email (см. prisma/import-employees.js).
//
// Вакантные позиции ("Вакансія"/"- неизв.* -") ВСЁ РАВНО создают узел
// Territory (география реальна независимо от того, занята позиция или
// нет) - просто не привязывают Employee.
//
// Сопоставление файл -> Employee: НЕ по транслитерации напрямую (проверено
// вживую - реальные email в базе не следуют единой схеме, Галас->Galas,
// но Стегура->Stehura, т.е. одна и та же буква "г" то G, то H) - вместо
// этого нормализованное сравнение фамилии (устраняет G/H, I/Y, KH/H,
// TS/C и т.п.), в пределах территории на уровень выше (ASM ищется среди
// Employee той же RM-территории, SV - среди Employee того же ASM).
// Однозначные совпадения (ровно 1 кандидат после фильтра по фамилии,
// или по фамилии+имени при нескольких однофамильцах) применяются
// автоматически; остальное остаётся как есть, без угадывания.
//
// Запуск: node prisma/import-territories.js "<путь к baseAsm.xlsx>"

require("dotenv/config");
const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("../app/generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const UNKNOWN_RE = /неизв|вакансія|вакансия/i;

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ]/gi, "")
    .replace(/kh/g, "h")
    .replace(/ts/g, "c")
    .replace(/[yi]+/g, "i")
    .replace(/[gh]/g, "h")
    .replace(/sch|shch/g, "sh");
}

const CYR_TO_LAT = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z",
  и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ю: "iu", я: "ia", ь: "", "'": "",
};
function translit(s) {
  return s
    .toLowerCase()
    .split("")
    .map((c) => CYR_TO_LAT[c] ?? c)
    .join("");
}

/** "ASM Сумська область (Швидкий Олександр Михайлович)" -> {role, territoryName, person} */
function parseCell(cell) {
  const m = String(cell).match(/^(\S+)\s+(.+?)\s*\(([^)]+)\)\s*$/);
  if (!m) return null;
  return { role: m[1], territoryName: `${m[1]} ${m[2].trim()}`, person: m[3].trim() };
}

function isUnknown(cell) {
  return UNKNOWN_RE.test(String(cell));
}

/** Ищет Employee среди candidates по фамилии (первое слово), при
 * нескольких однофамильцах сужает по имени (второе слово). */
function matchBySurname(person, candidates) {
  const [lastNameCyr, firstNameCyr = ""] = person.split(" ");
  const lastNameNorm = normalize(translit(lastNameCyr));
  const firstNameNorm = normalize(translit(firstNameCyr));
  let hits = candidates.filter((c) => normalize(c.name).includes(lastNameNorm));
  if (hits.length > 1) {
    const byFirst = hits.filter((c) => normalize(c.name).includes(firstNameNorm));
    if (byFirst.length >= 1) hits = byFirst;
  }
  return hits;
}

async function findOrCreateTerritory(prisma, cache, name, parentId) {
  const key = `${parentId ?? "root"}::${name}`;
  if (cache.has(key)) return cache.get(key);

  let territory = await prisma.territory.findFirst({ where: { name, parentId: parentId ?? null } });
  if (!territory) {
    territory = await prisma.territory.create({ data: { name, parentId: parentId ?? null } });
  }
  cache.set(key, territory);
  return territory;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node prisma/import-territories.js <path-to-baseAsm.xlsx>");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const wb = XLSX.readFile(path.resolve(filePath));
  const sheet = wb.Sheets["Лист2"];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const dataRows = rows.slice(7).filter((r) => r.some((c) => c !== ""));
  const col = { rm: 0, asm: 1, sv: 2 };
  console.log(`Прочитано строк: ${dataRows.length}`);

  const territoryCache = new Map();

  // ---- 1. Строим иерархию Territory из ВСЕХ строк (включая вакансии) ----
  // Уникальные пары (RM-cell, ASM-cell) и (ASM-cell, SV-cell), чтобы не
  // создавать узел дважды.
  const asmByRm = new Map(); // asmCell -> rmCell
  const svByAsm = new Map(); // svCell -> asmCell
  for (const r of dataRows) {
    const rm = r[col.rm], asm = r[col.asm], sv = r[col.sv];
    if (rm && asm) asmByRm.set(asm, rm);
    if (asm && sv) svByAsm.set(sv, asm);
  }

  const asmTerritoryByCell = new Map(); // asmCell -> Territory row
  for (const [asmCell, rmCell] of asmByRm) {
    const rmParsed = parseCell(rmCell);
    if (!rmParsed) continue;
    const rmTerritory = await findOrCreateTerritory(prisma, territoryCache, rmParsed.territoryName, null);

    const asmParsed = parseCell(asmCell);
    if (!asmParsed) continue;
    const asmTerritory = await findOrCreateTerritory(
      prisma,
      territoryCache,
      asmParsed.territoryName,
      rmTerritory.id
    );
    asmTerritoryByCell.set(asmCell, asmTerritory);
  }
  console.log(`ASM-территорий (с вакансиями): ${asmTerritoryByCell.size}`);

  const svTerritoryByCell = new Map(); // svCell -> Territory row
  for (const [svCell, asmCell] of svByAsm) {
    const asmTerritory = asmTerritoryByCell.get(asmCell);
    if (!asmTerritory) continue; // RM-cell был "неизв" и т.п. - пропускаем
    const svParsed = parseCell(svCell);
    if (!svParsed) continue;
    const svTerritory = await findOrCreateTerritory(
      prisma,
      territoryCache,
      svParsed.territoryName,
      asmTerritory.id
    );
    svTerritoryByCell.set(svCell, svTerritory);
  }
  console.log(`SV-территорий (с вакансиями): ${svTerritoryByCell.size}`);

  // ---- 2. Резолвим ASM: Employee <-> territoryId (уточняем) + сам объект для последующего SV-матчинга ----
  const rootTerritories = await prisma.territory.findMany({ where: { parentId: null } });
  const rootByName = new Map(rootTerritories.map((t) => [t.name, t.id]));

  const asmPos = await prisma.position.findUnique({ where: { code: "ASM" } });
  const svPos = await prisma.position.findUnique({ where: { code: "SV" } });
  const dbAsm = await prisma.employee.findMany({ where: { positionId: asmPos.id } });
  const dbSv = await prisma.employee.findMany({ where: { positionId: svPos.id } });

  const resolvedAsmEmployeeByCell = new Map(); // asmCell -> Employee row (для шага SV)
  let asmTerritoryLinked = 0;
  let asmNotResolved = 0;

  for (const [asmCell, rmCell] of asmByRm) {
    if (isUnknown(asmCell)) continue;
    const asmParsed = parseCell(asmCell);
    const rmParsed = parseCell(rmCell);
    if (!asmParsed || !rmParsed) continue;

    const broadTerritoryId = rootByName.get(rmParsed.territoryName);
    const candidates = dbAsm.filter((e) => e.territoryId === broadTerritoryId);
    const hits = matchBySurname(asmParsed.person, candidates);

    if (hits.length === 1) {
      const asmTerritory = asmTerritoryByCell.get(asmCell);
      await prisma.employee.update({ where: { id: hits[0].id }, data: { territoryId: asmTerritory.id } });
      resolvedAsmEmployeeByCell.set(asmCell, hits[0]);
      asmTerritoryLinked++;
    } else {
      asmNotResolved++;
    }
  }
  console.log(`ASM: уточнена территория у ${asmTerritoryLinked}, не резолвлено ${asmNotResolved}`);

  // ---- 3. Резолвим SV: managerId = резолвленный ASM, territoryId = точный район ----
  let svLinked = 0;
  let svAsmMissing = 0;
  let svNotResolved = 0;
  let svAmbiguous = 0;

  for (const [svCell, asmCell] of svByAsm) {
    if (isUnknown(svCell)) continue;
    const resolvedAsm = resolvedAsmEmployeeByCell.get(asmCell);
    if (!resolvedAsm) {
      svAsmMissing++;
      continue;
    }
    const svParsed = parseCell(svCell);
    if (!svParsed) continue;

    const broadTerritoryId = resolvedAsm.territoryId; // после шага 2 - уже область ASM, но кандидатов SV ищем по широкому RM-региону
    // SV ещё привязаны к широкому RM-региону (из Simple Table импорта) -
    // ищем среди них, сузим позже через сам факт совпадения фамилии.
    const rmParsed = parseCell(dataRows.find((r) => r[col.asm] === asmCell)?.[col.rm] ?? "");
    const rmBroadId = rmParsed ? rootByName.get(rmParsed.territoryName) : null;
    const candidates = dbSv.filter((e) => e.territoryId === rmBroadId);
    const hits = matchBySurname(svParsed.person, candidates);

    if (hits.length === 1) {
      const svTerritory = svTerritoryByCell.get(svCell);
      await prisma.employee.update({
        where: { id: hits[0].id },
        data: { managerId: resolvedAsm.id, territoryId: svTerritory ? svTerritory.id : undefined },
      });
      svLinked++;
    } else if (hits.length > 1) {
      svAmbiguous++;
    } else {
      svNotResolved++;
    }
    void broadTerritoryId; // зарезервировано, не используется напрямую в этой версии
  }
  console.log(
    `SV: связано ${svLinked}, ASM не резолвлен ${svAsmMissing}, неоднозначно ${svAmbiguous}, не найдено ${svNotResolved}`
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
