# game-engine-core

A 2D game engine for Electron with its own WebGPU renderer (**Aurora**), two game-logic cores — ECS (**Dogma**) and actor-based (**Pragma**) — and a UI system (**Navi**).

## Requirements

- Node.js 20+ and [pnpm](https://pnpm.io) (this repo uses a `pnpm-lock.yaml` — not npm/yarn)
- A system with WebGPU support (Electron 44 has it built in — nothing extra to install)

## Install

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

Starts the Electron app (`electron-forge start`) with hot reload.

## Build & distribution

```bash
pnpm package   # builds the app without packaging an installer
pnpm make      # builds and packages an installer for the current platform
pnpm preview   # package + quick preview of the built app
```

## Architecture

| Module              | Role                                                                                                     | Docs                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `src/core/aurora`   | WebGPU renderer (batching, lights, bloom, GPU debug)                                                     | [docs/aurora.md](docs/aurora.md)       |
| `src/core/dogma`    | ECS core — scenes/entities/components/systems                                                            | [docs/dogma.md](docs/dogma.md)         |
| `src/core/pragma`   | Actor-based core — scenes/actors/components with logic                                                   | [docs/pragma.md](docs/pragma.md)       |
| `src/core/navi`     | UI — node tree, layout, styles, animations, input                                                        | [docs/navi.md](docs/navi.md)           |
| `src/core/cello`    | Audio — Web Audio graph, category volume tree, effects, sound pooling                                    | [docs/cello.md](docs/cello.md)         |
| `src/core/axiom`    | Math/utils library — vectors, matrices, AABB, collisions, spatial grid, quad tree, easing, seeded random | [docs/axiom.md](docs/axiom.md)         |
| `src/core/engine`   | Glue: frame loop, input, time                                                                            | [docs/engine.md](docs/engine.md)       |
| `src/core/debugger` | Logger, performance/GPU telemetry, and the Electron profiler window (dev-only, stripped in prod)         | [docs/debugger.md](docs/debugger.md)   |
| `src/backend`, `src/preload` | Electron main process + preload bridge (`window.API`) — how the game talks to the OS/filesystem | [docs/backend.md](docs/backend.md)     |
| `src/sandbox`       | Where your own game code lives                                                                           | —                                      |

## Quick start

The game's entry point is `src/sandbox/index.ts` — `Engine.initialize` takes `preload` (async renderer setup, textures, fonts) and `setup` (build your first scene), then drives the frame loop itself.

```ts
// src/sandbox/index.ts
import Renderer from "@aurora/renderer/renderer";
import Engine from "@engine/engine";
import auroraConfig from "@aurora/renderer/config";
import Pragma from "@pragma/pragma";

async function preload() {
  const aurora = auroraConfig({
    userTextures: [],
    userFonts: [],
    feature: { bloom: false, lighting: false },
    debugger: "minimal",
    camera: { builtInCameraInputs: false, speed: 0 },
    rendering: {
      sortOrder: "y+x+z",
      renderRes: "1920x1080",
      toneMapping: "none",
      drawOrigin: "center",
      canvasColor: [0, 0, 0, 255],
    },
  });
  await Renderer.initialize(aurora);
}

function setup() {
  Pragma.addScene("Main");
  // Pragma.addActor(new Player(), "Main");
}

Engine.initialize({ setup, preload });
```

See the docs table above for the full API of each logic/UI core.
