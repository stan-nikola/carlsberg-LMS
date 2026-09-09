// Ключ localStorage для персонального імені на цьому пристрої — див.
// app/register/page.js. Стосується лише співробітників БЕЗ email у базі
// (Employee.email === null): у них Employee.name — заглушка з посади/
// території після імпорту, а не особисте ім'я, тож на сервері справжнє
// ім'я взагалі не зберігається (рішення користувача, не наш вибір).
// Функція викликається лише всередині Client Component-ів (у ефекті,
// після монтування), тому localStorage тут завжди доступний у браузері.
export const LOCAL_NAME_KEY = "employee_display_name_v1";

export function getLocalDisplayName() {
  try {
    return localStorage.getItem(LOCAL_NAME_KEY) || "";
  } catch {
    return "";
  }
}
