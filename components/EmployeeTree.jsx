"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GripIcon, ChevronIcon, SpinnerIcon } from "@/components/icons";

/**
 * Дерево ВСІЄЇ організації (app/api/admin/employees/tree — getTeamTree(null),
 * lib/managerDashboard.js) з перетягуванням вузла НА інший вузол = зміна
 * managerId. На відміну від reorder-паттерну в AdminDashboard.jsx/
 * AdminCourseEditor.jsx (drop МІЖ рядками, той самий список) — тут drop
 * ЗАВЖДИ означає "стати підлеглим вузла, на який кинули", контейнер
 * (дерево) не змінюється, тому семантика dragOver/drop інша, хоч сам
 * event-стек (draggable + onDragStart/onDragOver/onDrop/onDragEnd) і
 * .admin-drag-handle/.admin-drag-over CSS — той самий, що вже є в проєкті.
 */
export function EmployeeTree() {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null); // "root" — спецзначення для кореня
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

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

  // Множина id, які треба показати розгорнутими, щоб не загубити збіг
  // пошуку в глибині дерева — той самий принцип, що вже є в
  // TerritoryPicker.jsx: вузол видимий, якщо сам збігається АБО хтось із
  // нащадків збігається, і тоді весь ланцюжок предків примусово
  // розгортається.
  const { visibleIds, forceExpandIds } = useMemo(() => {
    if (!tree || !q.trim()) return { visibleIds: null, forceExpandIds: new Set() };
    const needle = q.trim().toLowerCase();
    const visible = new Set();
    const forceExpand = new Set();

    function walk(node, ancestors) {
      const selfMatch = node.name.toLowerCase().includes(needle);
      let anyChildMatch = false;
      for (const child of node.children) {
        if (walk(child, [...ancestors, node.id])) anyChildMatch = true;
      }
      if (selfMatch || anyChildMatch) {
        visible.add(node.id);
        if (anyChildMatch) forceExpand.add(node.id);
        return true;
      }
      return false;
    }
    for (const root of tree) walk(root, []);
    return { visibleIds: visible, forceExpandIds: forceExpand };
  }, [tree, q]);

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
      const res = await fetch(`/api/admin/employees/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerId: targetId === "root" ? null : targetId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (err) {
      window.alert("Не вдалося перепризначити: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  function renderNode(node, depth) {
    if (visibleIds && !visibleIds.has(node.id)) return null;
    const isOpen = expanded.has(node.id) || forceExpandIds.has(node.id);
    const hasChildren = node.children.length > 0;

    return (
      <li key={node.id} className="emp-tree-node">
        <div
          className={`emp-tree-row${overId === node.id ? " admin-drag-over" : ""}${node.isActive === false ? " emp-tree-row-inactive" : ""}`}
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
          <Link href={`/admin/employees/${node.id}`} className="emp-tree-name">
            {node.name}
            {node.isActive === false && <span className="admin-hint"> · деактивовано</span>}
          </Link>
          <span className="emp-tree-meta">
            {node.position?.name || "—"}
            {node.territory ? ` · ${node.territory.name}` : ""}
          </span>
        </div>
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
      <input
        className="admin-input-flex"
        placeholder="Пошук по дереву…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 360, marginBottom: 12 }}
      />
      {saving && (
        <p className="admin-subtitle">
          <SpinnerIcon />
          Зберігаємо…
        </p>
      )}
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
    </div>
  );
}
