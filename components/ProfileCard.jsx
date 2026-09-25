"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getLocalDisplayName } from "@/lib/localName";
import { MarqueeText } from "@/components/MarqueeText";
import { Avatar } from "@/components/Avatar";
import { CameraIcon, SpinnerIcon, XIcon } from "@/components/icons";

/**
 * Аватар + ім'я + код + рівень (.profile-card, і на Home, і на Профіль).
 * Для співробітників без email (hasEmail=false) підміняє ім'я з БД
 * (заглушка посади/території з імпорту) на те, що людина сама ввела при
 * вході — воно лежить тільки в localStorage цього пристрою, на сервері
 * взагалі не зберігається. Тому це Client Component: на сервері рендериться
 * dbName (SSR), після монтування в браузері підміняється, якщо є локальне
 * значення - без цього довелось би тягнути localStorage на сервер, що
 * неможливо.
 */
// Фліп аватара — вітальний жест: він має статись РІВНО один раз за
// завантаження сторінки. Модульний прапорець, а не CSS-анімація на класі:
// у dev React монтує компонент двічі (StrictMode), і аватар перевертався
// двічі поспіль (скарга користувача). Прапорець живе до перезавантаження
// сторінки — рівно стільки, скільки треба.
let avatarFlipPlayed = false;

/**
 * @param {{ dbName: string, hasEmail: boolean, levelLabel: string,
 *   avatarUrl?: string | null, editable?: boolean, href?: string }} props
 * `href` (лише на Home, `/hub/achievements?highlight=rating`) — уся
 * картка стає посиланням туди; лише коли не `editable` — усередині
 * editable-картки вже є власна кнопка (аватар), вкладений `<a>` навколо
 * `<button>` невалідний. Рядок "Ще N балів..." під карткою (був тут
 * 2026-09-22) прибрано зовсім третьою ітерацією того самого дня —
 * повна картка рейтингу вже є на "Досягнення", куди клік і веде.
 */
export function ProfileCard({ dbName, hasEmail, levelLabel, avatarUrl = null, editable = false, href }) {
  const [displayName, setDisplayName] = useState(dbName);
  const cardRef = useRef(null);

  useEffect(() => {
    if (avatarFlipPlayed) return;
    const node = cardRef.current?.querySelector(".avatar");
    if (!node) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    avatarFlipPlayed = true;
    // Навмисно без cancel у cleanup: у dev StrictMode прибирає й повертає
    // ефекти на тому САМОМУ вузлі — скасування вбило б єдиний показ.
    node.animate?.(
      [
        { transform: "perspective(320px) rotateY(-90deg)", opacity: 0 },
        { transform: "perspective(320px) rotateY(0deg)", opacity: 1 },
      ],
      { duration: 700, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
  }, []);
  // Фото профілю: на сторінках профілю (editable) клік по аватару відкриває
  // вибір файлу, сервер обрізає в квадрат і кладе у Blob
  // (app/api/profile/avatar). Стан локальний — без перезавантаження.
  const [avatar, setAvatar] = useState(avatarUrl);
  const [busy, setBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const fileRef = useRef(null);

  async function uploadAvatar(file) {
    if (!file) return;
    setBusy(true);
    setAvatarError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAvatar(data.url);
      // Локальний setAvatar оновлює лише цю картку. getCurrentUser()
      // (lib/session.js) — "use cache: private": за офіційною докою Next
      // такий кеш ЖИВЕ ЛИШЕ В ПАМ'ЯТІ БРАУЗЕРА, на сервері не зберігається
      // взагалі, і кожен маршрут (/hub, /manager, /hub/profile, ...)
      // викликає getCurrentUser() окремо — тобто в браузері лежить СТІЛЬКИ
      // незалежних копій цього кешу, скільки маршрутів людина вже
      // відвідала/попередньо завантажила. router.refresh() скидає лише
      // копію ПОТОЧНОГО маршруту (профіль) — сусідній /manager, якщо його
      // App Shell уже сидить у пам'яті з попередньої навігації, лишається
      // зі старим фото, поки не спливе cacheLife("minutes") сам. Перша
      // зміна фото за сесію "працювала" лише тому, що /manager ще не був
      // заздалегідь завантажений; друга — ні (живий тест на проді,
      // 2026-09-25). Повне перезавантаження стирає ВЕСЬ клієнтський стан
      // (усі копії разом), тож наступний вхід куди завгодно вже свіжий.
      window.location.reload();
      return;
    } catch (err) {
      setAvatarError(err.message || "Не вдалося завантажити фото.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function removeAvatar() {
    if (!window.confirm("Прибрати фото профілю?")) return;
    setBusy(true);
    setAvatarError("");
    try {
      await fetch("/api/profile/avatar", { method: "DELETE" });
      setAvatar(null);
      // Той самий привід, що й у uploadAvatar вище.
      window.location.reload();
      return;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Lazy useState-ініціалізатор тут не підходить: цей компонент
    // рендериться і на сервері (SSR), де localStorage відсутній —
    // значення можна прочитати лише в ефекті, після монтування на клієнті.
    if (!hasEmail) {
      const local = getLocalDisplayName();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (local) setDisplayName(local);
    }
  }, [hasEmail]);

  const CardTag = href ? Link : "div";

  return (
    <CardTag className={`profile-card${href ? " profile-card-link" : ""}`} href={href} ref={cardRef}>
      <div className="profile-card-top">
        {editable ? (
          <div className="avatar-edit">
            {/* Тап по кружку — вибрати/замінити фото. Значок у куті: без фото —
                камера (підказка, тапається наскрізь), з фото — «×» прибрати
                (окрема кнопка, бо кнопка в кнопці — невалідно). Режими не
                змішуються: щоб замінити фото, тапають сам кружок. */}
            <button
              type="button"
              className="avatar-edit-btn"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label={avatar ? "Змінити фото профілю" : "Додати фото профілю"}
              title={avatar ? "Змінити фото" : "Додати фото"}
            >
              <Avatar name={displayName} src={avatar} />
            </button>
            {busy ? (
              <span className="avatar-edit-badge" aria-hidden="true"><SpinnerIcon /></span>
            ) : avatar ? (
              <button type="button" className="avatar-edit-badge is-remove" onClick={removeAvatar} aria-label="Прибрати фото" title="Прибрати фото">
                <XIcon />
              </button>
            ) : (
              <span className="avatar-edit-badge" aria-hidden="true"><CameraIcon /></span>
            )}
            {/* accept="image/*" БЕЗ capture — тоді iOS показує нативний лист
                «Зробити фото / Медіатека / Файли», Android — «Камера / Галерея /
                Файли». capture="user" забрав би галерею на iPhone. */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => uploadAvatar(e.target.files?.[0])}
            />
          </div>
        ) : (
          <Avatar name={displayName} src={avatar} />
        )}
        <div className="profile-info">
          <MarqueeText as="div" className="profile-name">
            {displayName || "—"}
          </MarqueeText>
          <div className="profile-level">
            <span className="lv-star">★</span>
            <span>{levelLabel}</span>
          </div>
          {editable && !avatar && !busy && !avatarError && <div className="profile-avatar-hint">Торкніться кружка, щоб додати фото</div>}
          {avatarError && <div className="profile-avatar-hint is-error">{avatarError}</div>}
        </div>
      </div>
    </CardTag>
  );
}
