import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Той самий "@/*" -> "./*", що й у jsconfig.json — без цього тести не
// зможуть резолвити імпорти на кшталт "@/lib/prisma", якими написаний
// увесь проєкт.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.js"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
