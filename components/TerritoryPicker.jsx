"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronIcon } from "@/components/icons";

function TriStateCheckbox({ checked, indeterminate, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      type="checkbox"
      className="territory-checkbox"
      ref={ref}
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** ChevronIcon дивиться праворуч за замовчуванням — розвертаємо на 90°
 * замість тексту "▾"/"▸", коли вузол розгорнуто. */
function Caret({ open }) {
  return (
    <span className={`territory-caret${open ? " territory-caret-open" : ""}`}>
      <ChevronIcon />
    </span>
  );
}

/**
 * Дерево RM -> ASM -> SV замість плаского <select multiple> з відступами
 * тире. Пошук по назві території АБО по імені/посаді конкретного
 * співробітника звужує дерево одразу — "тп" знайде кожен регіон, де є
 * хоч один Торговий представник. Клік по вузлу будь-якого рівня вибирає
 * ЙОГО і ВСІХ нащадків одразу (вибрати цілу область — один клік).
 *
 * Territory.parentId дає лише ГЕОГРАФІЮ (RM -> ASM -> SV) і закінчується
 * на СВ — далі нема районів. Але реальна оргструктура (Employee.managerId)
 * триває глибше: СВ має підлеглих ТП/Мерчендайзерів, яких імпорт зміг
 * прив'язати по territoryId лише до цілого RM-регіону, не до конкретного
 * СВ-району (це не баг — так задокументовано в CLAUDE.md: не вигадувати
 * зв'язок, якого не можна вивести впевнено). Тому на листку дерева, де
 * рівно одна "відповідальна" людина (typовий СВ-випадок), рядок показує
 * її ім'я одразу поруч із назвою території, а розгортання каретки веде
 * НЕ до дітей-територій (їх нема), а до ЇЇ підлеглих по managerId —
 * дерево "перемикається" з географії на реальну оргструктуру рівно там,
 * де географія закінчується.
 *
 * @param {{ id: number, name: string, parentId: number|null }[]} territories
 * @param {{ id: number, name: string, positionName: string|null, territoryId: number|null, managerId: number|null }[]} employees
 * @param {number[]} value - обрані id територій (може бути будь-якого рівня дерева)
 * @param {(next: number[]) => void} onChange
 * @param {number[]} [employeeValue] - обрані id КОНКРЕТНИХ людей (точкове призначення
 *   в обхід посади/території — Course.targetEmployeeIds), окремо від value
 * @param {(next: number[]) => void} [onEmployeeChange]
 */
export function TerritoryPicker({ territories, employees, value, onChange, employeeValue = [], onEmployeeChange = () => {} }) {
  const [query, setQuery] = useState("");
  const [expandedTerritories, setExpandedTerritories] = useState(() => new Set());
  const [expandedPeople, setExpandedPeople] = useState(() => new Set());

  const { byId, childrenOf, roots, descendantsOf, employeesById, employeesByTerritory, employeesByManager, personDescendantsOf } =
    useMemo(() => {
      const byId = new Map(territories.map((t) => [t.id, t]));
      const childrenOf = new Map();
      for (const t of territories) {
        const key = t.parentId ?? null;
        if (!childrenOf.has(key)) childrenOf.set(key, []);
        childrenOf.get(key).push(t);
      }
      for (const list of childrenOf.values()) list.sort((a, b) => a.name.localeCompare(b.name, "uk"));
      const roots = childrenOf.get(null) || [];

      const descendantsOf = new Map();
      function collect(id) {
        if (descendantsOf.has(id)) return descendantsOf.get(id);
        const kids = childrenOf.get(id) || [];
        const acc = [];
        for (const kid of kids) {
          acc.push(kid.id, ...collect(kid.id));
        }
        descendantsOf.set(id, acc);
        return acc;
      }
      territories.forEach((t) => collect(t.id));

      const employeesById = new Map(employees.map((e) => [e.id, e]));
      const employeesByTerritory = new Map();
      const employeesByManager = new Map();
      for (const e of employees) {
        if (e.territoryId != null) {
          if (!employeesByTerritory.has(e.territoryId)) employeesByTerritory.set(e.territoryId, []);
          employeesByTerritory.get(e.territoryId).push(e);
        }
        if (e.managerId != null) {
          if (!employeesByManager.has(e.managerId)) employeesByManager.set(e.managerId, []);
          employeesByManager.get(e.managerId).push(e);
        }
      }

      // Так само, як descendantsOf для територій, але вздовж managerId —
      // для каскадного вибору "цю людину і всіх її підлеглих" одним кліком.
      const personDescendantsOf = new Map();
      function collectPerson(id) {
        if (personDescendantsOf.has(id)) return personDescendantsOf.get(id);
        const subs = employeesByManager.get(id) || [];
        const acc = [];
        for (const s of subs) {
          acc.push(s.id, ...collectPerson(s.id));
        }
        personDescendantsOf.set(id, acc);
        return acc;
      }
      employees.forEach((e) => collectPerson(e.id));

      return { byId, childrenOf, roots, descendantsOf, employeesById, employeesByTerritory, employeesByManager, personDescendantsOf };
    }, [territories, employees]);

  const matchedIds = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    return new Set(
      territories
        .filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (employeesByTerritory.get(t.id) || []).some(
              (e) => e.name.toLowerCase().includes(q) || (e.positionName || "").toLowerCase().includes(q)
            )
        )
        .map((t) => t.id)
    );
  }, [territories, query, employeesByTerritory]);

  // Під час пошуку показуємо: сам збіг, шлях до нього (батьки, щоб було
  // зрозуміло ДЕ це) і його нащадків (щоб можна було одразу вибрати ціле
  // піддерево знайденого вузла).
  const visibleIds = useMemo(() => {
    if (!matchedIds) return null;
    const visible = new Set();
    for (const id of matchedIds) {
      visible.add(id);
      for (const d of descendantsOf.get(id) || []) visible.add(d);
      let cur = byId.get(id);
      while (cur?.parentId != null) {
        visible.add(cur.parentId);
        cur = byId.get(cur.parentId);
      }
    }
    return visible;
  }, [matchedIds, descendantsOf, byId]);

  function toggleTerritoryExpand(id) {
    setExpandedTerritories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePersonExpand(id) {
    setExpandedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelect(node) {
    const covered = [node.id, ...(descendantsOf.get(node.id) || [])];
    const allSelected = covered.every((id) => value.includes(id));
    if (allSelected) {
      onChange(value.filter((id) => !covered.includes(id)));
    } else {
      onChange(Array.from(new Set([...value, ...covered])));
    }
  }

  function removeChip(id) {
    onChange(value.filter((v) => v !== id));
  }

  function removeEmployeeChip(id) {
    onEmployeeChange(employeeValue.filter((v) => v !== id));
  }

  // Той самий "вибрати вузол + усіх нащадків" принцип, що й toggleSelect
  // для територій, але вздовж managerId: вибрати ТП — вибрати лише його;
  // вибрати СВ у ролі "людини" (рідко, зазвичай СВ обирають через саму
  // територію) — захопить і всіх його підлеглих одразу.
  function togglePersonSelect(person) {
    const covered = [person.id, ...(personDescendantsOf.get(person.id) || [])];
    const allSelected = covered.every((id) => employeeValue.includes(id));
    if (allSelected) {
      onEmployeeChange(employeeValue.filter((id) => !covered.includes(id)));
    } else {
      onEmployeeChange(Array.from(new Set([...employeeValue, ...covered])));
    }
  }

  // Рядок людини в підпорядкуванні (managerId) — з чекбоксом для
  // точкового призначення (Course.targetEmployeeIds, в обхід
  // посади/території — саме те, чого нема на самій людині territoryId),
  // і так само розгортається вглиб, якщо в НЕЇ теж є підлеглі.
  function renderPersonNode(person) {
    const subs = employeesByManager.get(person.id) || [];
    const isOpen = expandedPeople.has(person.id);
    const covered = [person.id, ...(personDescendantsOf.get(person.id) || [])];
    const selectedCount = covered.filter((id) => employeeValue.includes(id)).length;
    const checked = selectedCount === covered.length;
    const indeterminate = !checked && selectedCount > 0;

    return (
      <div key={person.id} className="territory-node">
        <div
          className="territory-employee-row"
          onClick={() => (subs.length > 0 ? togglePersonExpand(person.id) : togglePersonSelect(person))}
        >
          {subs.length > 0 ? <Caret open={isOpen} /> : <span className="territory-caret territory-caret-spacer" />}
          <TriStateCheckbox checked={checked} indeterminate={indeterminate} onChange={() => togglePersonSelect(person)} />
          <span className="territory-employee-name">{person.name}</span>
          {person.positionName && <span className="territory-employee-position">{person.positionName}</span>}
        </div>
        {isOpen && subs.length > 0 && <div className="territory-children">{subs.map((s) => renderPersonNode(s))}</div>}
      </div>
    );
  }

  // Відступ — вкладені DOM-контейнери з border-left ("гілка дерева"), не
  // inline padding: вертикальна лінія тягнеться повз усіх дітей і
  // лишається видимою, навіть коли сам батьківський рядок вище вже
  // прокручено з очей.
  function renderNode(node) {
    if (visibleIds && !visibleIds.has(node.id)) return null;
    const kids = childrenOf.get(node.id) || [];
    const hasKids = kids.length > 0;
    const ownEmployees = employeesByTerritory.get(node.id) || [];
    // Географія закінчилась (листок) і на ньому РІВНО одна людина —
    // типовий СВ-випадок: показуємо її ім'я прямо в рядку, а не як
    // окремий пункт для розгортання.
    const responsiblePerson = !hasKids && ownEmployees.length === 1 ? ownEmployees[0] : null;
    const responsibleSubs = responsiblePerson ? employeesByManager.get(responsiblePerson.id) || [] : [];

    const isTerritoryExpanded = matchedIds ? true : expandedTerritories.has(node.id);
    const isPeopleExpanded = matchedIds ? true : expandedPeople.has(node.id);

    const covered = [node.id, ...(descendantsOf.get(node.id) || [])];
    const selectedCount = covered.filter((id) => value.includes(id)).length;
    const checked = selectedCount === covered.length;
    const indeterminate = !checked && selectedCount > 0;

    // Немає дітей-територій і немає єдиної відповідальної людини (нікого,
    // або кілька без чіткого "хто головний") — звичайний клікабельний
    // листок: клік одразу вибирає/знімає (див. onClick нижче).
    const canExpand = hasKids || (responsiblePerson && responsibleSubs.length > 0);

    return (
      <div key={node.id} className="territory-node">
        <div
          className="territory-row"
          onClick={() => {
            if (hasKids) toggleTerritoryExpand(node.id);
            else if (responsiblePerson && responsibleSubs.length > 0) togglePersonExpand(node.id);
            else toggleSelect(node);
          }}
        >
          {canExpand ? <Caret open={hasKids ? isTerritoryExpanded : isPeopleExpanded} /> : <span className="territory-caret territory-caret-spacer" />}
          <TriStateCheckbox checked={checked} indeterminate={indeterminate} onChange={() => toggleSelect(node)} />
          <span className="territory-name">{node.name}</span>
          <span className="territory-responsible">
            {responsiblePerson &&
              `— ${responsiblePerson.name}${responsiblePerson.positionName ? ` (${responsiblePerson.positionName})` : ""}`}
          </span>
        </div>
        {hasKids && isTerritoryExpanded && <div className="territory-children">{kids.map((kid) => renderNode(kid))}</div>}
        {responsiblePerson && isPeopleExpanded && responsibleSubs.length > 0 && (
          <div className="territory-children">{responsibleSubs.map((s) => renderPersonNode(s))}</div>
        )}
      </div>
    );
  }

  const visibleRoots = roots.filter((r) => !visibleIds || visibleIds.has(r.id));
  const selectedChips = value.map((id) => byId.get(id)).filter(Boolean);
  const selectedEmployeeChips = employeeValue.map((id) => employeesById.get(id)).filter(Boolean);

  return (
    <div className="territory-picker">
      {(selectedChips.length > 0 || selectedEmployeeChips.length > 0) && (
        <div className="territory-chips">
          {selectedChips.map((t) => (
            <span key={`t${t.id}`} className="territory-chip">
              {t.name}
              <button type="button" onClick={() => removeChip(t.id)} aria-label={`Прибрати ${t.name}`}>
                ✕
              </button>
            </span>
          ))}
          {selectedEmployeeChips.map((e) => (
            <span key={`e${e.id}`} className="territory-chip territory-chip-person">
              {e.name}
              <button type="button" onClick={() => removeEmployeeChip(e.id)} aria-label={`Прибрати ${e.name}`}>
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            className="admin-btn-link"
            onClick={() => {
              onChange([]);
              onEmployeeChange([]);
            }}
          >
            Очистити все
          </button>
        </div>
      )}
      <input
        className="admin-input-flex"
        placeholder="Пошук території, посади або ПІБ (наприклад: Арциз, ТП, Ковальчук)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="territory-tree">
        {visibleRoots.length === 0 ? (
          <p className="admin-hint territory-empty">Нічого не знайдено за «{query}».</p>
        ) : (
          visibleRoots.map((r) => renderNode(r))
        )}
      </div>
      <p className="admin-hint">Клік вибирає рівень і все, що під ним. Розгорніть дерево — можна дійти до конкретного співробітника.</p>
    </div>
  );
}
