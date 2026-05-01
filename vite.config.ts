import type { Loader } from "esbuild";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * latex.js ships dynamic require() targets that resolve to empty `.keep` files
 * under dist/packages and dist/documentclasses. esbuild must treat them as a
 * loadable type or pre-bundling / dev server fails.
 */
const keepLoader: Record<string, Loader> = {
  ".keep": "text",
};

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    esbuildOptions: {
      loader: keepLoader,
    },
  },
});
