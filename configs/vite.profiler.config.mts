import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import solid from "vite-plugin-solid";
// https://vitejs.dev/config
export default defineConfig(() => ({
  plugins: [solid(), tailwindcss()],
  build: {
    target: "esnext",
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "../index_profiler.html"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../src"),
    },
  },
  cacheDir: "node_modules/.vite/profiler_window",
}));
