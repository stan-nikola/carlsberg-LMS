// swagger-ui-dist не має власних типів; потрібен лише конструктор UI
// (components/admin/ApiDocs.tsx).
declare module "swagger-ui-dist/swagger-ui-bundle" {
  const SwaggerUIBundle: (options: Record<string, unknown>) => unknown;
  export default SwaggerUIBundle;
}
