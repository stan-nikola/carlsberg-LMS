"use client";

import { useEffect, useState } from "react";
import { CertificateIcon, SpinnerIcon } from "@/components/icons";
import { getLocalDisplayName } from "@/lib/localName";
import { downloadCertificate } from "@/lib/downloadCertificate";

/**
 * Сертифікати на екрані «Досягнення» — кожен курс на 100% із прямим
 * завантаженням PDF (той самий downloadCertificate, що в CourseTile/
 * CourseReview; ім'я для співробітника без email — з localStorage).
 */
export function CertificateList({ certificates, hasEmail }) {
  const [certName, setCertName] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasEmail) {
      const local = getLocalDisplayName();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (local) setCertName(local);
    }
  }, [hasEmail]);

  async function download(slug) {
    setBusy(slug);
    setError("");
    try {
      await downloadCertificate(slug, certName);
    } catch (err) {
      setError(err.message || "Не вдалося завантажити сертифікат.");
    } finally {
      setBusy(null);
    }
  }

  if (certificates.length === 0) {
    return <p className="hub-empty-note">Сертифікат видається за курс, складений на 100%. Поки що таких немає.</p>;
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
            <span>{new Date(c.completedAt).toLocaleDateString("uk-UA")} · 100%</span>
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
