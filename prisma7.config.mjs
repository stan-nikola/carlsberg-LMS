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
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
