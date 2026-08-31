import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
const isDev = process.env.npm_lifecycle_event === "dev";
const config: ForgeConfig = {
  packagerConfig: {},
  rebuildConfig: {},
  makers: [new MakerSquirrel({}), new MakerZIP({}, ["darwin"])],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/backend/main.ts",
          config: "configs/vite.main.config.ts",
        },
        {
          entry: "src/preload/preload.ts",
          config: "configs/vite.preload.config.ts",
        },
      ],
      renderer: [
        { name: "main_window", config: "configs/vite.renderer.config.ts" },
        ...(isDev
          ? [
              {
                name: "profiler_window",
                config: "configs/vite.profiler.config.ts",
              },
            ]
          : []),
      ],
    }),
  ],
};

export default config;
