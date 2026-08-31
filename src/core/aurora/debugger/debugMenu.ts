import ScreenPipeline from "../pipelines/screenPipeline";
import { RenderRes } from "../renderer/config";
import Renderer from "../renderer/renderer";
import AuroraDebugInfo, { TEXTURES_TO_SHOW } from "./debugInfo";
import {
  createCheckbox,
  createColorPicker,
  createDropDown,
  createMainMenu,
  createSlider,
  createSubMenu,
  displayText,
} from "./elements";

//THIS IS ONLY TEMPORARY TO QUICK TESTS! xD
//hold your horses!
export default function appendDebugMenu() {
  const screenSliders = screeSettingsMenu();
  const posts = postProc();
  const configs = renderConfig();
  const gameConfigs = gameStuff();
  const rendererMenu = createSubMenu({
    name: "ScreenSettings",
    children: screenSliders,
  });
  const post = createSubMenu({
    name: "PostProcessing",
    children: posts,
  });
  const canvas = createSubMenu({
    name: "Render",
    children: configs,
  });
  const world = createSubMenu({
    name: "World",
    children: gameConfigs,
  });
  createMainMenu([rendererMenu, post, canvas, world]);
}
function screeSettingsMenu() {
  const ranges = {
    exposure: [-2, 2],
    saturation: [-1, 1],
    contrast: [-1, 1],
    whiteBalance: [-1, 1],
    hueShift: [0, 360], //wheel shift
    brightness: [-1, 1],
    invert: [0, 1],
    tint: [1, 1, 1, 1], //rgb - color, a = nasilenie tintu
  };
  const screenSOpt: HTMLElement[] = [];
  const screenSettings = Renderer.getAllScreenSettings;
  Object.entries(screenSettings).forEach((setting) => {
    if (setting[0] === "padding" || setting[0] === "tint") return;
    const name = setting[0] as keyof typeof ranges;
    const range = ranges[name];
    screenSOpt.push(
      createSlider({
        name: setting[0],
        range: { min: range[0], max: range[1], init: 0, step: 0.01 },
        action: (value) => Renderer.setScreenSettings({ [name]: value }),
      })
    );
  });
  screenSOpt.push(
    createColorPicker({
      name: "tint",
      action: ({ mode, value }) => {
        const currentTint = Renderer.getAllScreenSettings.tint!;
        if (mode === "color") {
          Renderer.setScreenSettings({
            tint: [...value, currentTint[3]],
          });
        } else {
          Renderer.setScreenSettings({
            tint: [currentTint[0], currentTint[1], currentTint[2], value],
          });
        }
      },
    })
  );
  return screenSOpt;
}
function postProc() {
  const postOpt: HTMLElement[] = [];
  const posts = Renderer.getPostProcess();
  Object.entries(posts).forEach((postProcess) => {
    const postProcessName = postProcess[0];
    postOpt.push(displayText(postProcessName));
    const values = postProcess[1];
    Object.entries(values).forEach((postEnty) => {
      const entyName = postEnty[0];
      if (typeof postEnty[1] === "number") {
        postOpt.push(
          createSlider({
            name: entyName,
            range: { min: 0, max: 1, init: 0, step: 0.01 },
            action: (value) => {
              Renderer.setPostProcess({
                [postProcessName]: { [entyName]: value },
              });
            },
          })
        );
      } else if (Array.isArray(postEnty[1])) {
        postOpt.push(
          createColorPicker({
            name: "tint",
            useAlpha: false,
            action: ({ value }) => {
              Renderer.setPostProcess({
                [postProcessName]: { [entyName]: value },
              });
            },
          })
        );
      } else if (typeof postEnty[1] === "object") {
        const additionalEntries = postEnty[1]!;
        Object.entries(additionalEntries).forEach((additionalEntry) => {
          postOpt.push(
            createSlider({
              name: `${entyName}: ${additionalEntry[0]}`,
              range: { min: -1, max: 1, init: 0, step: 0.01 },
              action: (value) => {
                Renderer.setPostProcess({
                  [postProcessName]: {
                    [entyName]: { [additionalEntry[0]]: value },
                  },
                });
              },
            })
          );
        });
      }
    });
  });
  return postOpt;
}
function renderConfig() {
  const configs: HTMLElement[] = [];
  const res = Renderer.getCurrentResolution();
  configs.push(
    createDropDown({
      name: "Render Res",
      options: ["1920x1080", "1280x720", "854x480", "640x360"],
      selected: `${res.width}x${res.height}`,
      onClick: (value) =>
        Renderer.setRendererSettings({
          render: { renderRes: value as RenderRes },
        }),
    })
  );
  configs.push(
    createDropDown({
      name: "DisplayTexture",
      selected: "screen",
      options: TEXTURES_TO_SHOW as unknown as string[],
      onClick: (value) => {
        const index = TEXTURES_TO_SHOW.findIndex((string) => value === string);
        if (index === -1) {
          console.warn(
            `trying to change to texture with value: ${value}, but there is no texture`
          );
          return;
        }
        AuroraDebugInfo.debugVisibleTextureIndex[0] = index;
        AuroraDebugInfo.setParam("displayedTexture", TEXTURES_TO_SHOW[index]);
        const mode = TEXTURES_TO_SHOW[index] === "canvas" ? "screen" : "debug";
        ScreenPipeline.setDisplayMode(mode, TEXTURES_TO_SHOW[index]);
      },
    })
  );
  configs.push(
    createCheckbox({
      name: "Bloom",
      active: true,
      onChange: async (checked) => {
        await Renderer.setRendererSettings({ feature: { bloom: checked } });
      },
    })
  );
  configs.push(
    createCheckbox({
      name: "Light",
      active: true,
      onChange: async (checked) => {
        await Renderer.setRendererSettings({
          feature: { lighting: checked },
        });
      },
    })
  );

  return configs;
}
function gameStuff() {
  const gameConfigs: HTMLElement[] = [];
  gameConfigs.push(
    createColorPicker({
      name: "AmbientLight",
      useAlpha: false,
      action: ({ value }) => {
        Renderer.setGlobalIllumination(value as RGB);
      },
    })
  );
  gameConfigs.push(
    createSlider({
      action: (value) => AuroraDebugInfo.setSpriteStressTest(value),
      name: "spirtes",
      range: { min: 0, max: 1000, init: 1, step: 1 },
    })
  );
  return gameConfigs;
}
