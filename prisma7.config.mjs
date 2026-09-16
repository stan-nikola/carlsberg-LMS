// Конфиг Prisma CLI (генерация клиента, миграции). Начиная с Prisma 7
// строка подключения к БД живёт здесь, а не в prisma/schema.prisma.
// Имя файла (prisma7.config.mjs, а не prisma.config.mjs) — так его создаёт
// `prisma init` для текущей установленной версии CLI (7.x); переименовывать
// не нужно, иначе CLI его не найдёт.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.js",
  },
  datasource: {
    // Міграції — ЛИШЕ прямим з'єднанням, не через Neon pooler (PgBouncer):
    // migrate deploy бере session-level pg_advisory_lock, а pooler у
    // transaction-режимі може віддати lock/unlock різним бекендам — і
    // наступний деплой падає з P1002 «timed out trying to acquire a
    // postgres advisory lock» (2026-09-16, прод). Runtime (lib/prisma.js)
    // і далі йде через pooler по DATABASE_URL — тут лише CLI.
    // Neon: pooled host = <endpoint>-pooler.<region>…, direct = без -pooler.
    url: process.env.DIRECT_DATABASE_URL || (process.env.DATABASE_URL || "").replace("-pooler.", "."),
  },
});
