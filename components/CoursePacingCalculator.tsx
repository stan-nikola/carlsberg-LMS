"use client";

import { useMemo, useState } from "react";
import { buildCoursePlan, toPlanView, pluralDays } from "@/lib/coursePlan";
import { CoursePlanPanel } from "@/components/CoursePlan";

/**
 * Калькулятор розкладу в конструкторі курсу («Розклад» у налаштуваннях):
 * автор вписує «днів на модуль» і «мінімальну паузу», а тут одразу бачить
 * той самий план, який побачить співробітник у плеєрі — з датами від
 * умовної дати призначення (сьогодні або будь-якої іншої).
 *
 * Це НЕ окрема математика: усередині той самий buildCoursePlan /
 * CoursePlanPanel, що й у плеєрі (lib/coursePlan.ts, components/
 * CoursePlan.tsx) — тож прев'ю в конструкторі не може розійтись із тим,
 * що бачить людина. Власного тут лише: перевірки узгодженості (пауза
 * довша за вікно модуля; паузи не вкладаються в дедлайн) і кнопка
 * «підставити дедлайн», що рахує deadlineDays = модулів × днів на модуль.
 */

type ModuleLike = { id: number; title: string; order: number; cooldownDays: number | null };

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toInputDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function num(value: string | number | null | undefined): number | null {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function CoursePacingCalculator({
  modules,
  moduleDays,
  pauseDays,
  deadlineDays,
  onSuggestDeadline,
}: {
  /** Реальні модулі курсу (з власними паузами) — або порожньо, поки курс
   *  ще створюється; тоді кількість вводиться руками. */
  modules: ModuleLike[];
  moduleDays: string | number;
  pauseDays: string | number;
  deadlineDays: string | number;
  onSuggestDeadline: (days: number) => void;
}) {
  const [startDate, setStartDate] = useState(() => toInputDate(new Date()));
  const [manualCount, setManualCount] = useState(5);

  const perModule = num(moduleDays);
  const pause = num(pauseDays);
  const deadline = num(deadlineDays);
  const count = modules.length > 0 ? modules.length : manualCount;

  const view = useMemo(() => {
    const start = new Date(`${startDate}T09:00:00`);
    if (Number.isNaN(start.getTime()) || count === 0) return null;
    const inputs =
      modules.length > 0
        ? modules.map((m) => ({
            id: m.id,
            title: m.title,
            order: m.order,
            cooldownDays: m.cooldownDays,
            retakeCooldownDays: null,
            componentCount: 0,
          }))
        : Array.from({ length: count }, (_, i) => ({
            id: -(i + 1),
            title: `Модуль ${i + 1}`,
            order: i + 1,
            cooldownDays: null,
            retakeCooldownDays: null,
            componentCount: 0,
          }));
    const plan = buildCoursePlan(
      inputs,
      [],
      { assignedAt: start, dueDate: deadline != null ? addDays(start, deadline) : null },
      start,
      { moduleDays: perModule, pauseDays: pause }
    );
    return toPlanView(plan);
  }, [startDate, count, modules, perModule, pause, deadline]);

  // Перевірки узгодженості — те, що автор інакше дізнався б лише зі
  // скарги співробітника «модуль не відкривається, а дедлайн уже».
  const warnings: string[] = [];
  const suggested = perModule != null ? count * perModule : null;
  const pauseSum = modules.length > 0
    ? modules.reduce((sum, m, i) => (i === 0 ? sum : sum + (m.cooldownDays ?? pause ?? 0)), 0)
    : Math.max(0, count - 1) * (pause ?? 0);
  if (perModule != null && pause != null && pause > perModule) {
    warnings.push(`Пауза (${pause} ${pluralDays(pause)}) довша за вікно модуля (${perModule} ${pluralDays(perModule)}) — графік недосяжний.`);
  }
  if (deadline != null && pauseSum > deadline) {
    warnings.push(`Сума пауз між модулями (${pauseSum} ${pluralDays(pauseSum)}) більша за дедлайн (${deadline} ${pluralDays(deadline)}) — курс неможливо скласти вчасно.`);
  }
  if (deadline != null && suggested != null && suggested > deadline) {
    warnings.push(`За графіком курс займе ${suggested} ${pluralDays(suggested)}, а дедлайн — ${deadline}: людина відстане, навіть ідучи за графіком.`);
  }

  return (
    <div className="admin-pacing">
      <div className="admin-form-row admin-pacing-controls">
        <div className="admin-field">
          <label className="admin-label">Умовна дата призначення</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="admin-input-flex" />
        </div>
        {modules.length === 0 && (
          <div className="admin-field">
            <label className="admin-label">Модулів (для розрахунку)</label>
            <input
              type="number"
              min="1"
              max="50"
              value={manualCount}
              onChange={(e) => setManualCount(Math.max(1, Number(e.target.value) || 1))}
              className="admin-input-flex"
            />
          </div>
        )}
        {suggested != null && (
          <div className="admin-field">
            <label className="admin-label">Разом за графіком</label>
            <div className="admin-pacing-total">
              {suggested} {pluralDays(suggested)}
              {deadline !== suggested && (
                <button type="button" className="admin-btn-link" onClick={() => onSuggestDeadline(suggested)}>
                  Підставити як дедлайн
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {warnings.map((w) => (
        <p key={w} className="admin-hint admin-pacing-warning">
          {w}
        </p>
      ))}

      {view ? (
        <CoursePlanPanel plan={view} slug="" preview />
      ) : (
        <p className="admin-hint">Вкажіть кількість модулів — з’явиться розклад.</p>
      )}
    </div>
  );
}
