/** Українська форма слова для числа: 1 модуль, 3 модулі, 5 модулів (знак числа не важить). */
export function pluralWord(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** «3 модулі» — число разом зі словом у правильній формі. */
export function pluralize(n: number, one: string, few: string, many: string): string {
  return `${n} ${pluralWord(n, one, few, many)}`;
}
