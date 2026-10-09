"use client";

import { useEffect, useRef, useState } from "react";
import "swagger-ui-dist/swagger-ui.css";

/**
 * Swagger UI для openapi.yaml (/admin/api, 2026-10-04). Пакет swagger-ui-dist
 * — готова збірка без React-залежностей; підвантажується лише на цій сторінці
 * і лише в браузері (бандл звертається до window ще під час імпорту). Опис
 * віддає /api/admin/openapi за admin-сесією; «Try it out» шле запити з тими ж
 * cookie, тож адмінські ендпоінти можна викликати прямо звідси.
 */
export function ApiDocs() {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("swagger-ui-dist/swagger-ui-bundle")
      .then(({ default: SwaggerUIBundle }) => {
        if (cancelled || !ref.current) return;
        SwaggerUIBundle({
          domNode: ref.current,
          url: "/api/admin/openapi",
          deepLinking: true,
          docExpansion: "list",
          defaultModelsExpandDepth: 0,
          filter: true,
          displayRequestDuration: true,
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="admin-page adm-page">
      <div className="adm-page-head">
        <div>
          <h1>API</h1>
          <p className="admin-subtitle">
            Опис усіх ендпоінтів — <code>openapi.yaml</code> у корені репозиторію. Новий чи змінений ендпоінт описується в тому ж PR: без
            цього не пройде CI.
          </p>
        </div>
      </div>
      {failed ? <p className="admin-error">Не вдалося завантажити Swagger UI.</p> : <div ref={ref} className="api-docs" />}
    </div>
  );
}
