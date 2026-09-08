import { PrismaClient } from "@/app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 требует явный driver adapter для SQL-баз (см. prisma/schema.prisma
// и prisma7.config.mjs). Синглтон нужен, чтобы в dev-режиме (next dev с HMR)
// не плодить новое подключение к БД на каждый hot-reload.

const globalForPrisma = globalThis;

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}
