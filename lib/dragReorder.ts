/**
 * Чиста перестановка списку — «встав id перед/після overId» та «посунь
 * id на сусідню позицію». Той самий алгоритм, що вже є в
 * components/ManagerDashboard.jsx (moveCardBefore) для 2D-сітки карток;
 * тут — окремий модуль для звичайного вертикального списку («Порядок
 * кроків», конструктор і плеєр), щоб не переписувати ту саму логіку
 * вдруге й мати змогу перевірити її тестом без DOM.
 */

/**
 * Тягнемо вниз (from < to) — id стає ПІСЛЯ overId; тягнемо вгору —
 * ПЕРЕД. Без цього правила елемент «перестрибує» ціль на одну позицію
 * замість зайняти рівно її місце.
 */
export function reorderBefore<T>(list: T[], id: T, overId: T): T[] {
  const from = list.indexOf(id);
  const to = list.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = list.filter((x) => x !== id);
  next.splice(next.indexOf(overId) + (from < to ? 1 : 0), 0, id);
  return next;
}

/** Посунути id на один крок вгору/вниз — клавіатурна альтернатива драгу. */
export function moveAdjacent<T>(list: T[], id: T, dir: -1 | 1): T[] {
  const from = list.indexOf(id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
