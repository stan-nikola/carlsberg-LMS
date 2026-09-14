import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Той самий "@/*" -> "./*", що й у tsconfig.json — без цього тести не
// зможуть резолвити імпорти на кшталт "@/lib/prisma", якими написаний
// увесь проєкт.
export default defineConfig({
  test: {
    environment: "node",
    // .test.ts додано разом із поступовим переходом на TypeScript —
    // .test.js лишається (старі тести поки не мігровані).
    include: ["**/*.test.js", "**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
