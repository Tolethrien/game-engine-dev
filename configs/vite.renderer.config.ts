import { defineConfig } from "vite";
import path from "path";

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
  const isProd = mode === "production";
  return {
    assetsInclude: ["src/assets/*"],
    resolve: {
      alias: {
        "@sandbox": path.resolve(__dirname, "../src/sandbox"),
        "@engine": path.resolve(__dirname, "../src/core/engine"),
        "@dogma": path.resolve(__dirname, "../src/core/dogma"),
        "@utils": path.resolve(__dirname, "../src/utils"),
        "@debug": path.resolve(
          __dirname,
          isProd
            ? "../src/core/debugger/debug.prod.ts"
            : "../src/core/debugger/debug.ts",
        ),

        "@": path.resolve(__dirname, "../src"),
      },
    },
  };
});
