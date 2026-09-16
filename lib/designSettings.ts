import type { PrismaClient } from "@/app/generated/prisma";
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
 * ponytail: кеш у пам’яті процесу на 60с (один запит до бази на хвилину на
 * інстанс, зміна видима всім протягом хвилини; після збереження власний
 * інстанс скидає кеш одразу). Коли інстансів багато і хвилина заважає —
 * revalidateTag.
 */
export const DESIGN_SETTING_KEY = "design-tokens";
const TTL_MS = 60_000;

let cache: { at: number; value: SavedDesign | null } | null = null;

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

export async function getSavedDesign(): Promise<SavedDesign | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: SavedDesign | null = null;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: DESIGN_SETTING_KEY } });
    if (row) value = { values: sanitizeDesignValues(row.value), updatedAt: row.updatedAt };
  } catch (err) {
    // База недоступна або міграція ще не застосована — дефолти з tokens.css.
    console.warn("[design] settings read failed:", (err as Error)?.message);
  }
  cache = { at: Date.now(), value };
  return value;
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
  cache = null;
  return { values, updatedAt: row.updatedAt };
}

export async function resetDesign(): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: DESIGN_SETTING_KEY } });
  cache = null;
}
