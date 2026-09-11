"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { SettingsSheet } from "@/components/SettingsSheet";
import { GearIcon, LockIcon } from "@/components/icons";
import { PlatformBrand } from "@/components/PlatformBrand";

// Портовано з legacy index.html (regCard) + js/registration.js. Два кроки
// одного екрана (код -> PIN), як і раніше, тільки замість Apps Script —
// власні API routes (/api/auth/register, /api/auth/confirm), а замість
// localStorage-профілю — cookie-сесія (див. lib/session.js).
//
// Поле "Ваше ім'я" на сервер НЕ відправляється — Employee.name в базі
// правиться лише з email (керівний шар, lib/auth.js). Введене тут ім'я
// зберігається лише в localStorage цього пристрою (LOCAL_NAME_KEY) -
// для співробітників без email у базі лишається заглушка з посади/
// території, а особисте ім'я так і залишається приватним для пристрою,
// як і в legacy (telesale_profile_v1).

const RESEND_COOLDOWN_MS = 20000;
const LOCAL_NAME_KEY = "employee_display_name_v1";

export default function RegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState("identity");
  const [name, setName] = useState("");
  const [externalCode, setExternalCode] = useState("");
  const [pin, setPin] = useState("");

  const [codeError, setCodeError] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinWarning, setPinWarning] = useState("");
  // true — лист пішов самому співробітнику (є email, менеджерський шар),
  // false — керівнику (польові ролі без email в базі). null — ще
  // невідомо (email_send_failed узагалі не повертає isSelf — там уже є
  // свій явний pinWarning, окрема примітка "де шукати PIN" зайва).
  const [pinRecipientIsSelf, setPinRecipientIsSelf] = useState(null);

  const [submitBusy, setSubmitBusy] = useState(false);
  const [pinSubmitBusy, setPinSubmitBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendLabel, setResendLabel] = useState("Надіслати ще раз");

  const [codeHintOpen, setCodeHintOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const pinInputRef = useRef(null);

  async function callAuth(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async function handleSubmitIdentity(event) {
    event.preventDefault();
    setCodeError("");

    if (!name.trim() || !externalCode.trim()) {
      return;
    }

    setSubmitBusy(true);
    try {
      const resp = await callAuth("/api/auth/register", { externalCode: externalCode.trim() });
      if (resp.ok) {
        setPin("");
        setPinError("");
        setPinWarning("");
        setPinRecipientIsSelf(resp.isSelf);
        setStep("pin");
        setTimeout(() => pinInputRef.current?.focus(), 0);
      } else if (resp.error === "email_send_failed") {
        // PIN вже згенеровано і збережено на сервері (lib/auth.js) -
        // впав лише лист. Не блокуємо тут намертво: пускаємо далі на
        // екран вводу PIN з попередженням, а не залишаємо на кроці 1
        // без жодного способу рухатись, якщо PIN відомий якимось іншим
        // каналом (адміністратор, консоль сервера в dev-режимі тощо).
        setPin("");
        setPinError("");
        setPinWarning(
          "Не вдалося надіслати лист з PIN-кодом. Якщо ви дізналися код іншим способом — введіть його нижче."
        );
        setPinRecipientIsSelf(null);
        setStep("pin");
        setTimeout(() => pinInputRef.current?.focus(), 0);
      } else if (resp.error === "no_manager_email") {
        setCodeError("Для цього коду не вказано пошту для отримання PIN. Зверніться до адміністратора.");
      } else if (resp.error === "not_found") {
        setCodeError("Код не знайдено. Перевірте правильність і спробуйте ще раз.");
      } else {
        setCodeError("Помилка сервера: " + (resp.error || "unknown"));
      }
    } catch {
      setCodeError("Не вдалося надіслати запит. Перевірте інтернет-з'єднання і спробуйте ще раз.");
    } finally {
      setSubmitBusy(false);
    }
  }

  async function handleSubmitPin(event) {
    event.preventDefault();
    if (!pin.trim()) {
      setPinError("Введіть PIN-код.");
      return;
    }
    setPinError("");
    setPinSubmitBusy(true);
    try {
      const resp = await callAuth("/api/auth/confirm", {
        externalCode: externalCode.trim(),
        pin: pin.trim(),
      });
      if (resp.ok) {
        // Тільки на цей пристрій - в базу ім'я з цього поля не йде
        // взагалі (див. коментар зверху файлу).
        try {
          localStorage.setItem(LOCAL_NAME_KEY, name.trim());
        } catch {
          // localStorage недоступний - просто не запам'ятається, не критично
        }
        router.push("/hub");
        router.refresh();
      } else if (resp.error === "pin_expired") {
        setPinError("Час дії PIN-коду минув (діє 12 годин). Натисніть «Надіслати ще раз».");
      } else {
        setPinError("Невірний PIN-код. Спробуйте ще раз.");
      }
    } catch {
      setPinError("Не вдалося надіслати запит. Перевірте інтернет-з'єднання і спробуйте ще раз.");
    } finally {
      setPinSubmitBusy(false);
    }
  }

  function handleBackToIdentity() {
    setStep("identity");
    setPinError("");
    setPinWarning("");
  }

  async function handleResend() {
    if (resendBusy) return;
    setResendBusy(true);
    setPinError("");
    try {
      const resp = await callAuth("/api/auth/register", { externalCode: externalCode.trim() });
      if (resp.ok) {
        setPinRecipientIsSelf(resp.isSelf);
        setResendLabel("Надіслано ✓");
        setTimeout(() => {
          setResendLabel("Надіслати ще раз");
          setResendBusy(false);
        }, RESEND_COOLDOWN_MS);
      } else {
        setResendBusy(false);
        setPinError(
          resp.error === "email_send_failed"
            ? "Не вдалося надіслати PIN. Спробуйте ще раз пізніше або зверніться до адміністратора."
            : "Не вдалося надіслати PIN. Спробуйте ще раз."
        );
      }
    } catch {
      setResendBusy(false);
      setPinError("Не вдалося надіслати запит. Перевірте інтернет-з'єднання і спробуйте ще раз.");
    }
  }

  return (
    <div className="stage">
      <div className="course-col">
        <div className="course-card">
          <div className="appbar">
            <div style={{ flex: 1 }} />
            {/* Той самий LockIcon-лінк на /admin, що вже є в HubShell.jsx
                (там — лише для isAdmin співробітників, тут — до входу
                взагалі немає сесії, тому без умови: сама сторінка
                /admin/login веде далі свою перевірку паролем). */}
            <Link className="iconbtn iconbtn-bare" aria-label="Адмін-панель" href="/admin">
              <LockIcon />
            </Link>
            <button className="iconbtn iconbtn-bare" aria-label="Налаштування" onClick={() => setSettingsOpen(true)}>
              <GearIcon />
            </button>
          </div>

          <div className="reg-viewport">
            <div className="reg-badge">
              <PlatformBrand size="xl" stacked />
            </div>
            <h1 className="reg-h1">
              Ласкаво просимо! Зареєструйтесь, щоб відкрити свій особистий кабінет навчання.
            </h1>

            <div className={`reg-step${step === "identity" ? " active" : ""}`}>
              <form className="reg-form" id="regForm" onSubmit={handleSubmitIdentity}>
                <div className="field">
                  <label htmlFor="fName">Ваше ім&apos;я</label>
                  <input
                    type="text"
                    id="fName"
                    required
                    placeholder="Наприклад: Олена Коваль"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className={`field${codeError ? " has-error" : ""}`}>
                  <label htmlFor="fUserId">
                    <span>Ваш код</span>
                    <button
                      type="button"
                      className="reg-info-btn"
                      aria-label="Де знайти код"
                      onClick={() => setCodeHintOpen(true)}
                    >
                      i
                    </button>
                  </label>
                  <input
                    type="text"
                    id="fUserId"
                    required
                    placeholder="Наприклад: ml03005"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    value={externalCode}
                    onChange={(e) => setExternalCode(e.target.value)}
                  />
                  {codeError && <div className="field-error">{codeError}</div>}
                </div>
              </form>

              <div className="reg-note">
                Дані реєстрації зберігаються лише на цьому пристрої й використовуються для проходження
                курсів та ідентифікації результатів тестів.
              </div>
            </div>

            <div className={`reg-step${step === "pin" ? " active" : ""}`}>
              <div className={`field${pinError ? " has-error" : ""}`}>
                <label htmlFor="fPin">PIN-код підтвердження</label>
                <input
                  ref={pinInputRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  id="fPin"
                  className="reg-pin-input"
                  placeholder="••••"
                  autoComplete="one-time-code"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
                {pinError && <div className="field-error">{pinError}</div>}
              </div>

              {pinWarning && <div className="footnote">{pinWarning}</div>}

              {/* Два різних, лаконічних пояснення замість одного загального
                  "перевірте пошту, вказану в системі" — те формулювання не
                  мало сенсу для польових ролей (вони самі нічого не
                  отримують, лист іде керівнику). pinRecipientIsSelf===null
                  (email_send_failed) — пропускаємо: pinWarning вище вже
                  все пояснює. */}
              {pinRecipientIsSelf === true && (
                <div className="reg-note">PIN-код надіслано на вашу пошту і діє 12 годин.</div>
              )}
              {pinRecipientIsSelf === false && (
                <div className="reg-note">
                  PIN-код надіслано вашому керівнику — зверніться до нього. Діє 12 годин.
                </div>
              )}

              <div className="reg-step-links">
                <button type="button" className="reg-link-btn" onClick={handleBackToIdentity}>
                  ← Змінити код
                </button>
                <button type="button" className="reg-link-btn" disabled={resendBusy} onClick={handleResend}>
                  {resendLabel}
                </button>
              </div>
            </div>
          </div>

          <div className="reg-footer">
            <button
              className={`btn-primary-full${step === "identity" ? " step-active" : ""}${submitBusy ? " is-busy" : ""}`}
              type="submit"
              form="regForm"
              disabled={submitBusy}
            >
              <span className="btn-label">Зареєструватись</span>
              <svg className="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
              <span className="btn-spinner" aria-hidden="true" />
            </button>
            <button
              className={`btn-primary-full${step === "pin" ? " step-active" : ""}${pinSubmitBusy ? " is-busy" : ""}`}
              type="button"
              disabled={pinSubmitBusy}
              onClick={handleSubmitPin}
            >
              <span className="btn-label">Підтвердити</span>
              <svg className="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
              <span className="btn-spinner" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className={`sheet-overlay${codeHintOpen ? " open" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) setCodeHintOpen(false); }}>
        <div className="sheet">
          <div className="sheet-handle" />
          <h3>Де знайти ваш код?</h3>
          <p className="lead">
            Відкрийте застосунок Monolit Agent — ваш код показано поруч із номером версії у верхній
            частині екрана.
          </p>
          <div className="photo-frame">
            <Image
              src="/assets/monolit-code-hint.png"
              alt="Скріншот Monolit Agent із виділеним кодом"
              width={670}
              height={926}
            />
          </div>
          <p className="footnote">
            Код виглядає як комбінація літер і цифр у квадратних дужках, наприклад [ml03005].
          </p>
        </div>
      </div>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
