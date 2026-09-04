import { defineConfig } from "vite";
import path from "path";

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
  const isProd = mode === "production";
  return {
    build: { target: "esnext" },
    cacheDir: "node_modules/.vite/main_window",
    resolve: {
      alias: {
        "@sandbox": path.resolve(import.meta.dirname, "../src/sandbox"),
        "@engine": path.resolve(import.meta.dirname, "../src/core/engine"),
        "@dogma": path.resolve(import.meta.dirname, "../src/core/dogma"),
        "@utils": path.resolve(import.meta.dirname, "../src/utils"),
        "@debug": path.resolve(
          import.meta.dirname,
          isProd
            ? "../src/core/debugger/debug.prod.ts"
            : "../src/core/debugger/debug.ts",
        ),

        "@": path.resolve(import.meta.dirname, "../src"),
      },
    },
  };
});
