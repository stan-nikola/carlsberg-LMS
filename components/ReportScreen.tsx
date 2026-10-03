"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExcelIcon, SpinnerIcon, XIcon } from "@/components/icons";

type State = { kind: "loading" } | { kind: "ready"; file: File } | { kind: "error" };

/** Звіт з тими самими картками, що увімкнені в кабінеті; cookie-сесія застосунку. */
async function fetchReport(cards: string): Promise<State> {
  try {
    const r = await fetch(`/api/manager/export?cards=${encodeURIComponent(cards)}`);
    if (!r.ok) return { kind: "error" };
    const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") || "")?.[1] || "zvit-komandy.xlsx";
    const blob = await r.blob();
    return { kind: "ready", file: new File([blob], name, { type: blob.type }) };
  } catch {
    return { kind: "error" };
  }
}

/**
 * Екран Excel-звіту на iPhone/iPad (app/manager/report). Чому не прямий файл:
 * у встановленому застосунку iOS показує його на весь екран без жодної
 * дороги назад, а окреме вікно Safari не має cookie застосунку (порожньо).
 * Тут файл вантажиться в пам'ять у самому застосунку, а «Відкрити або
 * зберегти» віддає його в системне меню iOS (Excel, «Файли», Telegram,
 * пошта) — тап по кнопці дає жест, якого вимагає navigator.share, а файл
 * уже готовий. Де файлами ділитись не можна — звичайне завантаження.
 */
export function ReportScreen({ cards }: { cards: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    fetchReport(cards).then((next) => alive && setState(next));
    return () => {
      alive = false;
    };
  }, [cards]);

  function retry() {
    setState({ kind: "loading" });
    fetchReport(cards).then(setState);
  }

  function close() {
    if (window.history.length > 1) router.back();
    else router.push("/manager");
  }

  async function openOrSave(file: File) {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch {
        // Людина закрила меню — нічого не робимо.
      }
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="manager-page mgr-report">
      <div className="mgr-page-head">
        <button type="button" className="iconbtn mgr-back-btn" onClick={close} title="Закрити" aria-label="Закрити">
          <XIcon />
        </button>
        <span className="mgr-page-head-rule" aria-hidden="true" />
        <h1 className="greeting hub-greeting-h1">ЗВІТ</h1>
      </div>

      <div className="mgr-report-card">
        <span className="mgr-report-ico" aria-hidden="true">
          <ExcelIcon />
        </span>
        {state.kind === "loading" && (
          <p className="mgr-report-text" role="status">
            <SpinnerIcon /> Готуємо звіт…
          </p>
        )}
        {state.kind === "ready" && (
          <>
            <p className="mgr-report-name">{state.file.name}</p>
            <p className="mgr-report-text">{Math.max(1, Math.round(state.file.size / 1024))} КБ · листи за увімкненими картками кабінету</p>
            <button type="button" className="btn-primary-full" onClick={() => openOrSave(state.file)}>
              <span className="btn-label">Відкрити або зберегти</span>
            </button>
          </>
        )}
        {state.kind === "error" && (
          <>
            <p className="mgr-report-text">Не вдалося підготувати звіт.</p>
            <button type="button" className="btn-primary-full" onClick={retry}>
              <span className="btn-label">Спробувати ще раз</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
