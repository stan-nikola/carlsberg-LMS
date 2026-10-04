import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * openapi.yaml і app/api/**\/route.* мають збігатися (2026-10-04): новий,
 * перейменований чи видалений ендпоінт без правки опису валить CI — інакше
 * опис тихо розходиться з кодом і на рев'ю починає вводити в оману.
 */
const ROOT = path.resolve(__dirname, "..");
const METHODS = ["get", "post", "put", "patch", "delete"] as const;

function routeOperations(): string[] {
  const ops: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/^route\.(js|ts)$/.test(e.name)) {
        const route = "/" + path.relative(path.join(ROOT, "app"), dir).split(path.sep).join("/").replace(/\[([^\]]+)\]/g, "{$1}");
        const src = fs.readFileSync(p, "utf8");
        for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) ops.push(`${m[1]} ${route}`);
      }
    }
  };
  walk(path.join(ROOT, "app", "api"));
  return ops.sort();
}

type Operation = { summary?: string; responses?: Record<string, unknown> };
const spec = parse(fs.readFileSync(path.join(ROOT, "openapi.yaml"), "utf8")) as {
  openapi: string;
  paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
};

function specOperations(): string[] {
  return Object.entries(spec.paths)
    .flatMap(([p, item]) => METHODS.filter((m) => item[m]).map((m) => `${m.toUpperCase()} ${p}`))
    .sort();
}

describe("openapi.yaml", () => {
  it("описує рівно ті ендпоінти, що є в app/api", () => {
    const code = routeOperations();
    const documented = specOperations();
    expect({ missingInSpec: code.filter((o) => !documented.includes(o)), extraInSpec: documented.filter((o) => !code.includes(o)) }).toEqual({
      missingInSpec: [],
      extraInSpec: [],
    });
  });

  it("кожна операція має summary і хоча б одну відповідь", () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
    const incomplete = Object.entries(spec.paths).flatMap(([p, item]) =>
      METHODS.flatMap((m) => {
        const op = item[m];
        return op && (!op.summary || !op.responses || Object.keys(op.responses).length === 0) ? [`${m.toUpperCase()} ${p}`] : [];
      })
    );
    expect(incomplete).toEqual([]);
  });
});
