import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import solid from "vite-plugin-solid";
// https://vitejs.dev/config
export default defineConfig(({ mode }) => ({
  plugins: [solid(), tailwindcss()],
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, "../index_profiler.html"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../src"),
    },
  },
  cacheDir: "node_modules/.vite/profiler_window",
}));
