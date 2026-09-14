"use client";

import { useState } from "react";
import { SpinnerIcon } from "@/components/icons";

type ImportResult = {
  createdCount: number;
  skippedRows: { row: number; reason: string }[];
};

type Props = {
  /** Викликається, коли реально створено хоч одного — щоб список оновився. */
  onImported?: () => void;
};

/**
 * Масовий Excel-імпорт НОВИХ співробітників (Фаза B2). Раніше жив усередині
 * AdminEmployees.jsx як inline-форма за кнопкою в тулбарі — винесено на
 * окрему сторінку /admin/data разом з експортом і живою книгою: це
 * робота з базою, а не зі списком людей, і робить її інша людина в інший
 * момент (HR раз на місяць після вивантаження з кадрової системи).
 */
export function EmployeeImportForm({ onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/employees/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
      if (data.createdCount > 0) onImported?.();
    } catch (err) {
      setError("Помилка імпорту: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="admin-form-section">
      <p className="admin-subtitle">
        Тільки додавання нових співробітників (за кодом) — існуючих не чіпає. Заповніть шаблон і завантажте
        файл.
      </p>
      {/* Файл-завантаження (xlsx) — звичайний <a href>, не <Link>, щоб браузер
          сам ініціював завантаження; той самий патерн, що /api/manager/export. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="admin-btn-link" href="/api/admin/employees/import-template">
        ⬇ Завантажити шаблон (.xlsx)
      </a>
      <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {error && <p className="admin-error">{error}</p>}
      {result && (
        <div className="admin-hint">
          <p>Створено: {result.createdCount}</p>
          {result.skippedRows.length > 0 && (
            <ul>
              {result.skippedRows.map((s, i) => (
                <li key={i}>
                  Рядок {s.row}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="admin-btn-group">
        <button className="admin-btn" disabled={!file || uploading} onClick={handleUpload}>
          {uploading && <SpinnerIcon />}
          Імпортувати
        </button>
      </div>
    </div>
  );
}
