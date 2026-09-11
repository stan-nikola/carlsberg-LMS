/**
 * Рядки "Ваш код / Керівник (email) / Зареєстровано" + дисклеймер —
 * винесено з app/hub/profile/page.js, щоб той самий блок рендерився і в
 * /manager/profile (керівник теж Employee з managerId вгору по ієрархії).
 */
export function ProfileDetailPanel({ externalCode, managerEmail, firstLoginAt }) {
  return (
    <>
      <div className="profile-detail-list">
        <div className="pd-row">
          <span className="pd-k">Ваш код</span>
          <span className="pd-v">{(externalCode || "—").toUpperCase()}</span>
        </div>
        <div className="pd-row">
          <span className="pd-k">Керівник (email)</span>
          <span className="pd-v">{managerEmail || "—"}</span>
        </div>
        <div className="pd-row">
          <span className="pd-k">Зареєстровано</span>
          <span className="pd-v">{firstLoginAt ? new Date(firstLoginAt).toLocaleDateString("uk-UA") : "—"}</span>
        </div>
      </div>
      <p className="hub-empty-note">Дані використовуються лише для проходження курсів і зберігаються в системі компанії.</p>
    </>
  );
}
