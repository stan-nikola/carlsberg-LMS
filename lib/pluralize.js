/** "3 модулі" / "1 екран" / "5 екранів" — українська форма множини для
 * коротких підписів (кількість блоків/модулів/екранів курсу тощо).
 * Було продубльовано локально в components/AdminCourseEditor.jsx —
 * винесено сюди як єдине джерело, щоб CourseTile міг використати ту саму
 * логіку для картки курсу в хабі. */
export function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? few : many;
  return `${n} ${word}`;
}
