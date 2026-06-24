import { defineConfig } from "vite";
import path from "path";

// https://vitejs.dev/config
export default defineConfig({
  assetsInclude: ["src/assets/*"],
  resolve: {
    alias: {
      "@sandbox": path.resolve(__dirname, "../src/sandbox"),
      "@engine": path.resolve(__dirname, "../src/core/engine"),
      "@dogma": path.resolve(__dirname, "../src/core/dogma"),
      "@utils": path.resolve(__dirname, "../src/utils"),
      "@": path.resolve(__dirname, "../src"),
    },
  },
});
