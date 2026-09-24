import { debug } from "@debug";
import Aurora from "@/core/aurora/core";
import { DrawGui } from "@/core/aurora/urp/draw/draw";
import InputManager from "@engine/inputManager";
import { KEY, type KeyCode } from "@engine/keys";
import { COLOR } from "@/core/axiom/color";

const SHADERS = {
  error: /* wgsl */ `
fn brokenLength(value: vec3f) -> f32 {
  return value * 2.0;
}
@fragment fn fragmentMain() -> @location(0) vec4f {
  return vec4f(brokenLength(vec3f(1.0)));
}`,
  // textureSample under a branch on a varying breaks derivative uniformity, downgraded to a warning
  warning: /* wgsl */ `
diagnostic(warning, derivative_uniformity);
@group(0) @binding(0) var colorTexture: texture_2d<f32>;
@group(0) @binding(1) var colorSampler: sampler;
@fragment fn fragmentMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  if (uv.x > 0.5) {
    return textureSample(colorTexture, colorSampler, uv);
  }
  return vec4f(0.0);
}`,
};

const HELP = {
  position: { x: 24, y: 24 },
  lineHeight: 20,
  size: 15,
  font: "lato",
};

const state = {
  consoleSpamUntil: 0,
  consoleSpamFrame: 0,
};

const log = debug.log.scope("captureTest");

function later(action: () => void) {
  // async on purpose: a sync throw would abort the input handling of this frame
  setTimeout(action, 0);
}

const SCENARIOS: { key: KeyCode; label: string; run: () => void }[] = [
  {
    key: KEY.num1,
    label: "throw Error",
    run: () =>
      later(() => {
        throw new Error("capture test: thrown Error");
      }),
  },
  {
    key: KEY.num2,
    label: "throw string",
    run: () =>
      later(() => {
        throw "capture test: thrown string";
      }),
  },
  {
    key: KEY.num3,
    label: "unhandled reject Error",
    run: () => {
      Promise.reject(new Error("capture test: rejected promise"));
    },
  },
  {
    key: KEY.num4,
    label: "unhandled reject object",
    run: () => {
      Promise.reject({ code: 42, reason: "capture test: rejected with object" });
    },
  },
  {
    key: KEY.num5,
    label: "throw ×20 (throttle)",
    run: () => {
      for (let index = 0; index < 20; index++)
        later(() => {
          throw new Error("capture test: repeated throw");
        });
    },
  },
  {
    key: KEY.num6,
    label: "404 image",
    run: () => {
      const image = new Image();
      const remove = () => image.remove();
      image.addEventListener("error", remove);
      image.addEventListener("load", remove);
      image.src = `/capture-test-missing-${Date.now()}.png`;
      document.body.appendChild(image);
    },
  },
  {
    key: KEY.num7,
    label: "fetch unreachable host",
    run: () => {
      fetch("http://capture-test.invalid/nothing");
    },
  },
  {
    key: KEY.num8,
    label: "native console.*",
    run: () => {
      console.log("capture test: native log", { hp: 74, tags: ["a", "b"] });
      console.info("capture test: native info");
      console.debug("capture test: native debug");
      console.warn("capture test: native warn", 12);
      console.error("capture test: native error", new Error("inside console.error"));
    },
  },
  {
    key: KEY.num9,
    label: "native console.log every frame, 3 s",
    run: () => {
      state.consoleSpamUntil = performance.now() + 3000;
    },
  },
  {
    key: KEY.num0,
    label: "WGSL compile error",
    run: () => {
      Aurora.createShader("capture-test:error", SHADERS.error);
    },
  },
  {
    key: KEY.q,
    label: "WGSL compile warning",
    run: () => {
      Aurora.createShader("capture-test:warning", SHADERS.warning);
    },
  },
  {
    key: KEY.w,
    label: "WebGPU validation error",
    run: () => {
      Aurora.device.createBuffer({ label: "capture-test:bad-usage", size: 4, usage: 0 });
    },
  },
  {
    key: KEY.e,
    label: "WebGPU same error ×20",
    run: () => {
      for (let index = 0; index < 20; index++)
        Aurora.device.createTexture({
          label: "capture-test:zero-size",
          size: { width: 0, height: 0 },
          format: "rgba8unorm",
          usage: GPUTextureUsage.TEXTURE_BINDING,
        });
    },
  },
  {
    key: KEY.r,
    label: "audio decode error",
    run: () => {
      new AudioContext().decodeAudioData(new ArrayBuffer(16));
    },
  },
  {
    key: KEY.t,
    label: "debug.log.error(Error) (reference)",
    run: () => log.error("handled, logged by hand:", new Error("capture test: handled")),
  },
  {
    key: KEY.y,
    label: "freeze 15 s",
    run: () => {
      const until = performance.now() + 15_000;
      while (performance.now() < until) {
        // busy wait: the renderer must stop answering to trigger "unresponsive"
      }
    },
  },
  {
    key: KEY.u,
    label: "crash game process",
    run: () => window.API.DEBUG.crashGame(),
  },
];

export function setupCaptureTest() {
  log.notify(
    "capture test ready, keys:\n" +
      SCENARIOS.map(({ key, label }) => `${keyName(key)}  ${label}`).join("\n"),
  );
}

export function captureTest() {
  for (const scenario of SCENARIOS) {
    if (!InputManager.isKeyPressed(scenario.key)) continue;
    log.log(`run: ${scenario.label}`);
    scenario.run();
  }

  if (performance.now() < state.consoleSpamUntil)
    console.log("capture test: native spam frame", state.consoleSpamFrame++);

  drawHelp();
}

function drawHelp() {
  SCENARIOS.forEach(({ key, label }, index) => {
    DrawGui.text({
      position: {
        x: HELP.position.x,
        y: HELP.position.y + index * HELP.lineHeight,
      },
      font: HELP.font,
      text: `${keyName(key)}   ${label}`,
      size: HELP.size,
      color: COLOR.WHITE,
    });
  });
}

function keyName(key: KeyCode) {
  return key.replace("Digit", "").replace("Key", "");
}
