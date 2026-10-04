"use client";

import { useState } from "react";
import { useSeenValue } from "@/lib/useSeenValue";
import { CertificateIcon, SpinnerIcon } from "@/components/icons";
import { downloadCertificate } from "@/lib/downloadCertificate";

/**
 * Сертифікати на екрані «Досягнення» — кожен складений курс із прямим
 * завантаженням PDF (той самий downloadCertificate, що в CourseTile/
 * CourseReview).
 * `storageKey` — «новий з минулого візиту» (localStorage, стенд Motion
 * Tuner «E»): сертифікати, яких не було минулого разу, ставлять печатку.
 */
export function CertificateList({ certificates, storageKey = null }) {
  const [busy, setBusy] = useState(null);
  const prevSeen = useSeenValue(storageKey, certificates.map((c) => c.slug).join(","));
  const fresh = new Set(prevSeen == null ? [] : certificates.map((c) => c.slug).filter((s) => !prevSeen.split(",").includes(s)));
  const [error, setError] = useState("");

  async function download(slug) {
    setBusy(slug);
    setError("");
    try {
      await downloadCertificate(slug);
    } catch (err) {
      setError(err.message || "Не вдалося завантажити сертифікат.");
    } finally {
      setBusy(null);
    }
  }

  if (certificates.length === 0) {
    return <p className="hub-empty-note">Сертифікат видається за складений курс. Поки що таких немає.</p>;
  }

  return (
    <div className="cert-list">
      {certificates.map((c) => (
        <div key={c.slug} className={`cert-row${fresh.has(c.slug) ? " is-new" : ""}`}>
          <span className="cert-ico">
            <CertificateIcon />
          </span>
          <span className="cert-body">
            <b>{c.title}</b>
            <span>{new Date(c.completedAt).toLocaleDateString("uk-UA")}{c.scorePercent != null && ` · ${c.scorePercent}%`}</span>
          </span>
          <button type="button" className="admin-btn" onClick={() => download(c.slug)} disabled={busy === c.slug} aria-label={`Завантажити сертифікат: ${c.title}`}>
            {busy === c.slug ? <SpinnerIcon /> : "PDF"}
          </button>
        </div>
      ))}
      {error && <p className="cp-note ct-certificate-error">{error}</p>}
    </div>
  );
}
