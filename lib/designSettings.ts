import type { PrismaClient } from "@/app/generated/prisma";
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { DESIGN_TOKENS, type TokenValues } from "@/lib/designTokens";

const prisma = prismaUntyped as PrismaClient;

/**
 * Дизайн-токени, збережені «для всіх» із /admin/design (супер-адмін):
 * один рядок AppSetting(key="design-tokens") → <style>:root{…}</style> у
 * кореневому layout, поверх дефолтів tokens.css. Значення проходять через
 * whitelist DESIGN_TOKENS (ключ, діапазон, варіант) — у <style> ніколи не
 * потрапляє довільний рядок з запиту.
 *
 * Кеш — унутрішній Data Cache Next (unstable_cache), НЕ змінна в пам'яті
 * процесу (аудит швидкодії, 2026-09-18): на Vercel serverless-функції не
 * діляться пам'яттю між викликами, тож попередній `let cache = …` фактично
 * не працював на проді — кожен рендер кожної сторінки (а кореневий layout
 * був `force-dynamic`, тобто це буквально КОЖЕН запит) ходив у базу лише
 * заради «чи не перефарбував хтось кнопки». Це й було головною причиною
 * загального відчуття «повільно скрізь».
 */
export const DESIGN_SETTING_KEY = "design-tokens";
const CACHE_TAG = "design-tokens";

export type SavedDesign = { values: TokenValues; updatedAt: Date };

/** Лише відомі ключі з допустимими значеннями; решта відкидається. */
export function sanitizeDesignValues(input: unknown): TokenValues {
  const out: TokenValues = {};
  if (!input || typeof input !== "object") return out;
  const src = input as Record<string, unknown>;
  for (const t of DESIGN_TOKENS) {
    const raw = src[t.key];
    if (typeof raw !== "string") continue;
    if (t.kind === "px") {
      const m = /^(\d+(?:\.\d+)?)px$/.exec(raw.trim());
      if (!m) continue;
      const n = Math.min(t.max, Math.max(t.min, Number(m[1])));
      if (n !== t.def) out[t.key] = `${n}px`;
    } else if (t.choices.some((c) => c.value === raw) && raw !== t.def) {
      out[t.key] = raw;
    }
  }
  return out;
}

const readSavedDesign = unstable_cache(
  async (): Promise<SavedDesign | null> => {
    try {
      const row = await prisma.appSetting.findUnique({ where: { key: DESIGN_SETTING_KEY } });
      return row ? { values: sanitizeDesignValues(row.value), updatedAt: row.updatedAt } : null;
    } catch (err) {
      // База недоступна або міграція ще не застосована — дефолти з tokens.css.
      console.warn("[design] settings read failed:", (err as Error)?.message);
      return null;
    }
  },
  ["design-settings"],
  { tags: [CACHE_TAG], revalidate: 60 }
);

export async function getSavedDesign(): Promise<SavedDesign | null> {
  return readSavedDesign();
}

/** CSS для <style> у layout; порожній рядок, якщо нічого не збережено. */
export function designCss(values: TokenValues | undefined | null): string {
  if (!values) return "";
  const lines = Object.entries(values).map(([k, v]) => `--${k}:${v}`);
  return lines.length ? `:root{${lines.join(";")}}` : "";
}

export async function saveDesign(input: unknown): Promise<SavedDesign> {
  const values = sanitizeDesignValues(input);
  const row = await prisma.appSetting.upsert({
    where: { key: DESIGN_SETTING_KEY },
    update: { value: values },
    create: { key: DESIGN_SETTING_KEY, value: values },
  });
  // { expire: 0 } — не "max": супер-адмін, який щойно зберіг, має побачити
  // зміну одразу на наступному запиті, а не чекати на фонову ревалідацію
  // (те саме "власний інстанс скидає кеш одразу", що було в старому
  // in-memory варіанті).
  revalidateTag(CACHE_TAG, { expire: 0 });
  return { values, updatedAt: row.updatedAt };
}

export async function resetDesign(): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: DESIGN_SETTING_KEY } });
  revalidateTag(CACHE_TAG, { expire: 0 });
}
