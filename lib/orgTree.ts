/**
 * Видимість вузлів у дереві оргструктури (/admin/org,
 * components/EmployeeTree.jsx). Чиста функція з тестами саме тому, що
 * тут уже був баг: пошук показував знайденого керівника, але його
 * підлеглих ховав — під людиною було порожньо, хоча підлеглі є (скарга
 * користувача, 2026-09-23).
 *
 * Правила (однакові для пошуку й для фільтра «показувати заморожених»):
 *  - вузол видно, якщо він САМ підходить — і тоді видно ВСЕ його піддерево;
 *  - вузол видно, якщо підходить хтось із нащадків — тоді він лишається як
 *    ланка ланцюжка й примусово розгортається (інакше збіг у глибині
 *    просто не видно);
 *  - решта ховається.
 */

export type OrgNode = {
  id: number;
  name: string;
  isActive?: boolean;
  children: OrgNode[];
};

export type TreeVisibility = {
  /** null — фільтрів немає, показуємо все (дешевий шлях). */
  visibleIds: Set<number> | null;
  forceExpandIds: Set<number>;
};

export function computeTreeVisibility(
  tree: OrgNode[] | null,
  { query = "", showInactive = true }: { query?: string; showInactive?: boolean } = {}
): TreeVisibility {
  const needle = query.trim().toLowerCase();
  if (!tree || (!needle && showInactive)) return { visibleIds: null, forceExpandIds: new Set() };

  const visible = new Set<number>();
  const forceExpand = new Set<number>();

  const addSubtree = (node: OrgNode) => {
    // Заморожених не тягнемо в піддерево, коли фільтр їх ховає — інакше
    // вимкнений прапорець нічого не міняв би під знайденим керівником.
    if (!showInactive && node.isActive === false) return;
    visible.add(node.id);
    for (const child of node.children) addSubtree(child);
  };

  function walk(node: OrgNode): boolean {
    const matchesSearch = !needle || node.name.toLowerCase().includes(needle);
    const matchesActive = showInactive || node.isActive !== false;
    const selfMatch = matchesSearch && matchesActive;

    let anyChildMatch = false;
    for (const child of node.children) {
      if (walk(child)) anyChildMatch = true;
    }

    if (selfMatch) {
      addSubtree(node);
      if (anyChildMatch) forceExpand.add(node.id);
      return true;
    }
    if (anyChildMatch) {
      visible.add(node.id);
      forceExpand.add(node.id);
      return true;
    }
    return false;
  }

  for (const root of tree) walk(root);
  return { visibleIds: visible, forceExpandIds: forceExpand };
}
