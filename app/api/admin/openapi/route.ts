import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/adminSession";

// GET /api/admin/openapi — опис API (openapi.yaml з кореня репозиторію) для
// Swagger UI на /admin/api. Лише супер-адміну (розділ «Для розробника»):
// перелік ендпоінтів — не публічна інформація. На Vercel файл потрапляє у функцію через
// outputFileTracingIncludes у next.config.mjs.
export async function GET() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const yaml = await fs.readFile(path.join(process.cwd(), "openapi.yaml"), "utf8");
  return new Response(yaml, { headers: { "Content-Type": "application/yaml; charset=utf-8", "Cache-Control": "no-store" } });
}
