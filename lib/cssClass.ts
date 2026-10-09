/** Клас-модифікатор зі значення стану: «in_progress» → «is-in-progress».
 *  Значення в даних — snake_case (статуси в базі), класи в CSS — kebab-case.
 *  Немає значення — немає класу. */
export function isClass(value: string | null | undefined): string {
  return value ? "is-" + value.replaceAll("_", "-") : "";
}
