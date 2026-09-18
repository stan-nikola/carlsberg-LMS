"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** "через 12 хв" / "менше ніж за хвилину" — для повідомлення про блокування. */
function minutesUntil(isoDate) {
  const ms = new Date(isoDate).getTime() - Date.now();
  const minutes = Math.ceil(ms / 60000);
  return minutes > 0 ? `${minutes} хв` : "менше ніж хвилину";
}

// Отдельный вход в /admin по общему паролю (ADMIN_PASSWORD, см.
// app/api/admin/login/route.js) — не связан с employee PIN-логином
// (/register). Сознательно минималистичный, вне брендового .course-card
// shell (см. app/styles/admin.css).
export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        router.push("/admin");
        router.refresh();
      } else if (data.error === "not_configured") {
        setError("ADMIN_PASSWORD не налаштовано на сервері.");
      } else if (data.error === "locked") {
        setError(`Забагато невдалих спроб. Спробуйте ще раз через ${minutesUntil(data.retryAt)}.`);
      } else {
        setError("Невірний пароль.");
      }
    } catch {
      setError("Не вдалося надіслати запит. Перевірте з'єднання.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page" style={{ maxWidth: 360, paddingTop: "20vh" }}>
      <h1>Адмін-панель</h1>
      <form onSubmit={handleSubmit}>
        <div className="admin-field">
          <label className="admin-label" htmlFor="admin-password">
            Пароль
          </label>
          <input
            id="admin-password"
            type="password"
            className="admin-input-flex"
            style={{ width: "100%" }}
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div className="admin-error">{error}</div>}
        </div>
        <button className="admin-btn" type="submit" disabled={busy}>
          {busy ? "Вхід…" : "Увійти"}
        </button>
      </form>
    </div>
  );
}
