"use client";

import { useState, type ReactNode } from "react";
import { SpinnerIcon } from "@/components/icons";
import { api } from "@/lib/api";

/** Рядок «назва + Додати …» під списком модулів, екранів чи компонентів. */
export function NewItemForm<T>({
  endpoint,
  makeBody,
  onCreated,
  placeholder,
  label,
  savingLabel,
  hint,
  titleRequired = true,
  inputClassName = "admin-input-flex",
  buttonClassName = "admin-btn",
  children,
}: {
  endpoint: string;
  makeBody: (title: string) => Record<string, unknown>;
  onCreated: (created: T) => void;
  placeholder: string;
  label: string;
  /** Підпис кнопки, поки йде запит (за замовчуванням той самий). */
  savingLabel?: string;
  hint: string;
  titleRequired?: boolean;
  inputClassName?: string;
  buttonClassName?: string;
  /** Додаткові поля між назвою і кнопкою (тип компонента). */
  children?: ReactNode;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (titleRequired && !title.trim()) return;
    setSaving(true);
    try {
      const created = await api<T>(endpoint, { method: "POST", body: makeBody(title) });
      setTitle("");
      onCreated(created);
    } catch {
      // Не створилось — назва лишається в полі, можна спробувати ще раз.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-row admin-new-lesson">
      <input
        placeholder={placeholder}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        className={inputClassName}
      />
      {children}
      <button type="button" onClick={handleCreate} disabled={saving} className={buttonClassName} title={hint}>
        {saving && <SpinnerIcon />}
        {saving && savingLabel ? savingLabel : label}
      </button>
    </div>
  );
}
