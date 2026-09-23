"use client";

import { useEffect, useMemo, useState } from "react";
import { GripIcon, ChevronIcon, SpinnerIcon } from "@/components/icons";
import { EmployeeDrawer } from "@/components/EmployeeDrawer";
import { computeTreeVisibility } from "@/lib/orgTree";

/**
 * Дерево ВСІЄЇ організації (app/api/admin/employees/tree — getTeamTree(null),
 * lib/managerDashboard.js) з перетягуванням вузла НА інший вузол = зміна
 * managerId. На відміну від reorder-паттерну в AdminDashboard.jsx/
 * AdminCourseEditor.jsx (drop МІЖ рядками, той самий список) — тут drop
 * ЗАВЖДИ означає "стати підлеглим вузла, на який кинули", контейнер
 * (дерево) не змінюється, тому семантика dragOver/drop інша, хоч сам
 * event-стек (draggable + onDragStart/onDragOver/onDrop/onDragEnd) і
 * .admin-drag-handle/.admin-drag-over CSS — той самий, що вже є в проєкті.
 *
 * Клік по імені відкриває бічну панель з повною карткою (EmployeeDrawer —
 * той самий компонент, що в списку /admin/employees), а в самому рядку є
 * швидкі дії: перейменувати, заморозити/розморозити, скинути PIN, додати
 * підлеглого (рішення користувача, 2026-09-23). Дії показуються при
 * наведенні/фокусі — інакше 1600 рядків перетворюються на стіну кнопок.
 */
export function EmployeeTree() {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null); // "root" — спецзначення для кореня
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [drawerId, setDrawerId] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [addUnderId, setAddUnderId] = useState(null);
  // /admin/org?focus=<employeeId> — з картки співробітника: розгорнути
  // ланцюжок до нього, підсвітити й прокрутити (раніше лінк вів на
  // згорнуте дерево всієї компанії — скарга 2026-09-15).
  const [focusId] = useState(() =>
    typeof window === "undefined" ? null : Number(new URLSearchParams(window.location.search).get("focus")) || null
  );

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!tree || !focusId) return;
    const path = [];
    const find = (nodes, trail) => {
      for (const n of nodes) {
        if (n.id === focusId) {
          path.push(...trail, n.id);
          return true;
        }
        if (find(n.children, [...trail, n.id])) return true;
      }
      return false;
    };
    find(tree, []);
    if (path.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpanded((prev) => new Set([...prev, ...path]));
    const t = setTimeout(() => document.getElementById(`emp-node-${focusId}`)?.scrollIntoView({ block: "center" }), 50);
    return () => clearTimeout(t);
  }, [tree, focusId]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/employees/tree");
      const data = await res.json();
      setTree(data.tree || []);
    } catch {
      setError("Не вдалося завантажити дерево.");
    } finally {
      setLoading(false);
    }
  }

  /** Точкова заміна одного вузла в дереві — щоб після перейменування чи
   *  заморозки не перезапитувати всі 1600 рядків і не згортати дерево. */
  function patchNodeLocally(id, patch) {
    const walk = (nodes) =>
      nodes.map((n) => (n.id === id ? { ...n, ...patch, children: n.children } : { ...n, children: walk(n.children) }));
    setTree((prev) => (prev ? walk(prev) : prev));
  }

  // Видимість рядків — чиста функція з тестами (lib/orgTree.ts): саме
  // тут був баг, коли знайдений керівник показувався без підлеглих.
  const { visibleIds, forceExpandIds } = useMemo(
    () => computeTreeVisibility(tree, { query: q, showInactive }),
    [tree, q, showInactive]
  );

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Заборона циклу на клієнті (щоб не бити зайвий 400-запит) — не можна
  // кинути вузол на себе чи на власного нащадка. Сервер (PATCH
  // /api/admin/employees/:id) все одно перевіряє те саме через
  // getAllSubordinates — це лише швидка UI-підказка.
  function isDescendant(node, targetId) {
    if (node.id === targetId) return true;
    return node.children.some((c) => isDescendant(c, targetId));
  }
  function draggedNode(id, nodes = tree) {
    for (const n of nodes || []) {
      if (n.id === id) return n;
      const found = draggedNode(id, n.children);
      if (found) return found;
    }
    return null;
  }

  async function handleDrop(targetId) {
    const sourceId = dragId;
    setDragId(null);
    setOverId(null);
    if (sourceId == null) return;
    if (targetId !== "root" && sourceId === targetId) return;

    const source = draggedNode(sourceId);
    if (!source) return;
    if (targetId !== "root" && isDescendant(source, targetId)) {
      window.alert("Не можна перенести керівника під його ж підлеглого.");
      return;
    }
    const targetNode = targetId === "root" ? null : draggedNode(targetId);
    const targetLabel = targetId === "root" ? "верхній рівень (без керівника)" : targetNode?.name;
    if (!window.confirm(`Перепризначити «${source.name}» під «${targetLabel}»?`)) return;

    setSaving(true);
    try {
      await patchEmployee(sourceId, { managerId: targetId === "root" ? null : targetId });
      await load();
    } catch (err) {
      window.alert("Не вдалося перепризначити: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function patchEmployee(id, data) {
    const res = await fetch(`/api/admin/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  /** Заморозити = Employee.isActive:false (м'яке видалення, CLAUDE.md):
   *  людина не може увійти, але підлеглі, призначення й історія лишаються. */
  async function toggleActive(node) {
    const freeze = node.isActive !== false;
    const childCount = node.children.length;
    const warning = freeze && childCount > 0 ? `\n\nУ нього ${childCount} підлеглих — вони лишаться на місці.` : "";
    if (!window.confirm(`${freeze ? "Заморозити" : "Розморозити"} «${node.name}»?${warning}`)) return;
    setBusyId(node.id);
    try {
      await patchEmployee(node.id, { isActive: !freeze });
      patchNodeLocally(node.id, { isActive: !freeze });
    } catch (err) {
      window.alert("Не вдалося: " + err.message);
    } finally {
      setBusyId(null);
    }
  }

  function startRename(node) {
    setRenameId(node.id);
    setRenameValue(node.name);
  }

  async function saveRename(node) {
    const name = renameValue.trim();
    if (!name || name === node.name) {
      setRenameId(null);
      return;
    }
    setBusyId(node.id);
    try {
      await patchEmployee(node.id, { name });
      patchNodeLocally(node.id, { name });
      setRenameId(null);
    } catch (err) {
      window.alert("Не вдалося перейменувати: " + err.message);
    } finally {
      setBusyId(null);
    }
  }

  /** Скидання PIN = форсована повторна відправка листа (той самий канал,
   *  що й звичайний вхід): співробітнику з email, інакше його керівнику. */
  async function resetPin(node) {
    if (!window.confirm(`Надіслати новий PIN для «${node.name}»?`)) return;
    setBusyId(node.id);
    try {
      const res = await fetch(`/api/admin/employees/${node.id}/reset-pin`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
      window.alert(data.sentTo ? `Новий PIN надіслано на ${data.sentTo}.` : "Новий PIN надіслано.");
    } catch (err) {
      window.alert("Не вдалося скинути PIN: " + err.message);
    } finally {
      setBusyId(null);
    }
  }

  const drawerIsOpen = drawerId != null;

  function renderNode(node, depth) {
    if (visibleIds && !visibleIds.has(node.id)) return null;
    const isOpen = expanded.has(node.id) || forceExpandIds.has(node.id);
    const hasChildren = node.children.length > 0;
    const frozen = node.isActive === false;
    const busy = busyId === node.id;

    return (
      <li key={node.id} className="emp-tree-node">
        <div
          id={`emp-node-${node.id}`}
          className={`emp-tree-row${overId === node.id ? " admin-drag-over" : ""}${frozen ? " emp-tree-row-inactive" : ""}${node.id === focusId ? " emp-tree-row-focus" : ""}`}
          style={{ paddingLeft: depth * 20 }}
          onDragOver={(e) => {
            e.preventDefault();
            setOverId(node.id);
          }}
          onDragLeave={() => setOverId((cur) => (cur === node.id ? null : cur))}
          onDrop={() => handleDrop(node.id)}
        >
          <button
            type="button"
            className={`admin-accordion-caret${isOpen ? " open" : ""}`}
            onClick={() => toggle(node.id)}
            aria-label={isOpen ? "Згорнути" : "Розгорнути"}
            style={{ visibility: hasChildren ? "visible" : "hidden" }}
          >
            <ChevronIcon />
          </button>
          <span
            className="admin-drag-handle"
            draggable
            onDragStart={() => setDragId(node.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
          >
            <GripIcon />
          </span>

          {renameId === node.id ? (
            <input
              className="admin-input-flex emp-tree-rename"
              value={renameValue}
              autoFocus
              disabled={busy}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename(node);
                if (e.key === "Escape") setRenameId(null);
              }}
              onBlur={() => saveRename(node)}
              aria-label="Нове ім'я"
            />
          ) : (
            <button type="button" className="emp-tree-name" onClick={() => setDrawerId(node.id)}>
              {node.name}
              {frozen && <span className="admin-hint"> · заморожено</span>}
            </button>
          )}

          <span className="emp-tree-meta">
            {node.position?.name || "—"}
            {node.territory ? ` · ${node.territory.name}` : ""}
          </span>

          <span className="emp-tree-actions">
            {busy && <SpinnerIcon />}
            <button type="button" className="admin-btn-link" onClick={() => startRename(node)} disabled={busy}>
              Перейменувати
            </button>
            <button type="button" className="admin-btn-link" onClick={() => toggleActive(node)} disabled={busy}>
              {frozen ? "Розморозити" : "Заморозити"}
            </button>
            <button type="button" className="admin-btn-link" onClick={() => resetPin(node)} disabled={busy}>
              Скинути PIN
            </button>
            <button
              type="button"
              className="admin-btn-link"
              onClick={() => {
                setAddUnderId(node.id);
                setExpanded((prev) => new Set([...prev, node.id]));
              }}
              disabled={busy}
            >
              + Підлеглий
            </button>
          </span>
        </div>

        {addUnderId === node.id && (
          <AddSubordinateForm
            managerName={node.name}
            depth={depth + 1}
            onCancel={() => setAddUnderId(null)}
            onCreated={async () => {
              setAddUnderId(null);
              await load();
            }}
            managerId={node.id}
          />
        )}

        {hasChildren && isOpen && <ul className="emp-tree-children">{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  }

  if (loading) {
    return (
      <p className="admin-subtitle">
        <SpinnerIcon />
        Завантаження дерева…
      </p>
    );
  }
  if (error) return <p className="admin-error">{error}</p>;

  return (
    <div>
      <div className="emp-tree-toolbar">
        <input
          className="admin-input-flex"
          placeholder="Пошук по дереву…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <label className="emp-tree-toggle">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Показувати заморожених
        </label>
        {saving && (
          <span className="admin-subtitle">
            <SpinnerIcon />
            Зберігаємо…
          </span>
        )}
      </div>
      <div
        className={`emp-tree-root-drop${overId === "root" ? " admin-drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOverId("root");
        }}
        onDragLeave={() => setOverId((cur) => (cur === "root" ? null : cur))}
        onDrop={() => handleDrop("root")}
      >
        Перетягніть сюди, щоб зробити керівником верхнього рівня (без свого керівника)
      </div>
      <ul className="emp-tree-children emp-tree-top">{(tree || []).map((n) => renderNode(n, 0))}</ul>

      {drawerIsOpen && (
        <EmployeeDrawer
          employeeId={drawerId}
          onClose={() => setDrawerId(null)}
          onChanged={(updated) => {
            // Картка змінила ім'я/статус — оновлюємо той самий рядок у
            // дереві, не перезапитуючи все.
            if (updated && typeof updated === "object") {
              const { name, isActive } = updated;
              patchNodeLocally(drawerId, {
                ...(typeof name === "string" ? { name } : null),
                ...(typeof isActive === "boolean" ? { isActive } : null),
              });
            }
          }}
        />
      )}
    </div>
  );
}

/** Створення співробітника одразу під конкретним керівником: POST
 *  /api/admin/employees приймає managerId, тож окремого кроку
 *  «створити → знайти → перетягнути» не потрібно. */
function AddSubordinateForm({ managerId, managerName, depth, onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [externalCode, setExternalCode] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!name.trim() || !externalCode.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          externalCode: externalCode.trim(),
          email: email.trim() || null,
          managerId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error === "externalCode already exists" ? "Такий код уже існує" : data.error || `HTTP ${res.status}`);
      onCreated(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="emp-tree-add" style={{ paddingLeft: depth * 20 }}>
      <span className="admin-hint">Новий підлеглий для «{managerName}»</span>
      <div className="emp-tree-add-fields">
        <input className="admin-input-flex" placeholder="Ім'я" value={name} autoFocus onChange={(e) => setName(e.target.value)} aria-label="Ім'я" />
        <input
          className="admin-input-flex mono"
          placeholder="Код (напр. RNE999)"
          value={externalCode}
          onChange={(e) => setExternalCode(e.target.value)}
          aria-label="Код співробітника"
        />
        <input className="admin-input-flex" type="email" placeholder="Email (опційно)" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        <button type="button" className="admin-btn" onClick={create} disabled={saving || !name.trim() || !externalCode.trim()}>
          {saving && <SpinnerIcon />}
          Створити
        </button>
        <button type="button" className="admin-btn-link" onClick={onCancel} disabled={saving}>
          Скасувати
        </button>
      </div>
      {error && <p className="admin-error">{error}</p>}
    </div>
  );
}
