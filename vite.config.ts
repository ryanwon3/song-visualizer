import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("./web", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
  },
});
