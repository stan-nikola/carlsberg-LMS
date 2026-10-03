"use client";

import { useState } from "react";
import { CertificateIcon, SpinnerIcon } from "@/components/icons";
import { downloadCertificate } from "@/lib/downloadCertificate";

/**
 * Сертифікати на екрані «Досягнення» — кожен складений курс із прямим
 * завантаженням PDF (той самий downloadCertificate, що в CourseTile/
 * CourseReview).
 */
export function CertificateList({ certificates }) {
  const [busy, setBusy] = useState(null);
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
        <div key={c.slug} className="cert-row">
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
