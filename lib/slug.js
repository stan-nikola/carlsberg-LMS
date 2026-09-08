import { prisma } from "@/lib/prisma";

const CYR_TO_LAT = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z",
  и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ю: "iu", я: "ia", ь: "", "'": "",
};

export function slugify(title) {
  const translit = title
    .toLowerCase()
    .split("")
    .map((c) => CYR_TO_LAT[c] ?? c)
    .join("");
  return (
    translit
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "course"
  );
}

/**
 * @param {string} baseSlug
 * @param {number} [excludeId] - не враховувати цей курс при перевірці
 *   унікальності (перегенерація slug для курсу, який сам уже займає якийсь
 *   slug — інакше він завжди "конфліктував" би сам із собою).
 */
export async function uniqueSlug(baseSlug, excludeId) {
  let slug = baseSlug;
  let suffix = 2;
  while (await prisma.course.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }
  return slug;
}
