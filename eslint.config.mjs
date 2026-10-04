import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // JS не перевіряє tsc (checkJs:false) — неоголошена змінна в .jsx доходила
  // до прода й валила сторінку (2026-10-04: `pointsEarned` на чекпоінті модуля).
  { files: ["**/*.{js,jsx,mjs,cjs}"], rules: { "no-undef": "error" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Сгенерированный Prisma Client — не наш код, пересоздаётся `prisma generate`.
    "app/generated/**",
  ]),
]);

export default eslintConfig;
