import { defineConfig } from "vite";
import path from "path";
import solid from "vite-plugin-solid";
// https://vitejs.dev/config
export default defineConfig(({ mode }) => ({
  plugins: [solid()],
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, "../index_profiler.html"),
    },
  },
  resolve: {},
  cacheDir: "node_modules/.vite/profiler_window",
}));
