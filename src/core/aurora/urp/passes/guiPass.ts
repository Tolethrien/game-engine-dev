import { assert } from "@axiom/utils";
import AxiomMath from "@axiom/math";
import { COLOR } from "@axiom/color";
import Aurora from "@aurora/core";
import {
  MultiPass,
  MultiPassContext,
  PassFormats,
  PassResources,
} from "@aurora/pass";
import PassBinds, { PassBindEntries } from "@aurora/passBinds";
import Material from "@aurora/material";
import GrowingBuffer from "@aurora/utils/growingBuffer";
import { AuroraUsage } from "@aurora/utils/usage";
import DrawGuiShader from "../shaders/drawGuiShader.wgsl?raw";
import BackdropShader from "../shaders/backdropShader.wgsl?raw";
import { guiDraw } from "../draw/drawGui";
import { GUI_LAYOUT, InstanceWriter } from "../draw/drawInternal";
import { DEFAULT_MATERIAL } from "../draw/materials";
import ClipBuffer from "../clip/clipBuffer";
import { CLIP, materialOf } from "../clip/clip";
import {
  BACKDROP,
  BackdropRegion,
  BackdropTracker,
} from "../backdrop/backdrop";

const TARGET = "gui";
const GUI_BINDS = {
  clips: { binding: 0, type: "storage", readOnly: true },
  backdrop: { binding: 1, type: "texture" },
  backdropScene: { binding: 2, type: "texture" },
} satisfies PassBindEntries;
const PYRAMID_BINDS = {
  scene: { binding: 0, type: "texture" },
  gui: { binding: 1, type: "texture" },
  source: { binding: 2, type: "texture" },
} satisfies PassBindEntries;
interface PyramidPipelines {
  // mip 0 of a group: gui drawn so far over the scene
  snapshot: GPURenderPipeline;
  // mip 0 of the scene pyramid: the scene alone
  scene: GPURenderPipeline;
  // every level above mip 0
  downsample: GPURenderPipeline;
}

// gui in canvas pixels, drawn in call order into its own target; present composes it over the scene.
// a MultiPass because a backdrop group ends the draw step, blurs what is drawn so far and goes on
export default class GuiPass extends MultiPass {
  name: string = "GuiPass";
  private instances = new GrowingBuffer({
    label: "guiPassInstances",
    stride: GUI_LAYOUT.stride,
    usage: AuroraUsage.buffer.VERTEX,
  });
  private writer = GUI_LAYOUT.createWriter(this.instances);
  private clips = new ClipBuffer("guiPassClips");
  private backdrops = new BackdropTracker();
  // step labels made once, the timer reads one per step every frame
  private readonly pyramidLabels = {
    group: labels("backdrop"),
    scene: labels("backdropScene"),
  };
  // indexed by material id
  declare private pipelines: GPURenderPipeline[];
  declare private binds: PassBinds<typeof GUI_BINDS>;
  declare private pyramidBinds: PassBinds<typeof PYRAMID_BINDS>;
  declare private pyramid: PyramidPipelines;

  destroy() {
    this.instances.destroy();
    this.clips.destroy();
  }
  public get getClips() {
    return this.clips;
  }
  public get getBackdrops() {
    return this.backdrops;
  }
  // index of the instance push wrote last
  public get getLastIndex() {
    return this.instances.getCount - 1;
  }
  public push(): InstanceWriter {
    this.writer.at(this.instances.push());
    return this.writer;
  }

  async setup(targets: PassFormats) {
    const materials = Material.getAll;
    assert(
      materials.length <= CLIP.materialMask + 1,
      `GuiPass: at most ${CLIP.materialMask + 1} materials, the rest of materialClip holds the clip id`,
    );
    this.binds = new PassBinds("guiPass", GUI_BINDS);
    // one bind group per pyramid level, each reads the level below
    this.pyramidBinds = new PassBinds(
      "guiPassPyramid",
      PYRAMID_BINDS,
      BACKDROP.levels + 1,
    );
    const drawTargets = { colors: [targets.formats.get(TARGET)!] };
    const pyramidTargets = { colors: [targets.formats.get(BACKDROP.temp)!] };
    const pyramid = (label: string, compose: boolean, withGui: boolean) =>
      Aurora.createRenderPipeline(pyramidTargets, {
        label: `GuiPass:${label}`,
        shader: BackdropShader,
        binds: this.pyramidBinds.layout,
        constants: { compose, withGui },
      });
    const [pipelines, snapshot, scene, downsample] = await Promise.all([
      Promise.all(
        materials.map((material) =>
          Aurora.createRenderPipeline(drawTargets, {
            label: `GuiPass:${material.name}`,
            shader: DrawGuiShader.replace("// MATERIAL", material.fragment),
            buffers: [GUI_LAYOUT.layout],
            binds: this.binds.layout,
            blend: material.gpuBlend,
            constants: { linearColors: Aurora.isLinear },
          }),
        ),
      ),
      pyramid("backdropSnapshot", true, true),
      pyramid("backdropScene", true, false),
      pyramid("backdropDownsample", false, true),
    ]);
    this.pipelines = pipelines;
    this.pyramid = { snapshot, scene, downsample };
    guiDraw.setTarget(this);
  }
  resources(res: PassResources) {
    res.readAsset("albedo");
    res.readAsset("ui");
    res.readAsset("fonts");
    res.read("offscreenCanvas");
    res.sampler("linearClamp");
    // the first draw step clears, a separate graph clear would cost an extra pass
    res.create(
      TARGET,
      { format: "rgba16float", size: { scale: 1, base: "canvas" } },
      { clear: false },
    );
    const pyramid = {
      size: { scale: 0.5, base: "canvas" as const },
      format: "rgba16float" as const,
      mips: BACKDROP.levels,
    };
    // two textures: a scene backdrop drawn after a group snapshot must not read overwritten data
    res.temp(BACKDROP.temp, pyramid, { clear: false });
    res.temp(BACKDROP.sceneTemp, pyramid, { clear: false });
  }
  clearFrame() {
    this.instances.clear();
    this.clips.reset();
    this.backdrops.reset(Aurora.canvas.width, Aurora.canvas.height);
    guiDraw.clearFrame();
  }

  execute(_encoder: GPUCommandEncoder, ctx: MultiPassContext) {
    this.clips.upload();
    const binds = this.binds.get({
      clips: this.clips.getBuffer,
      backdrop: ctx.view(BACKDROP.temp),
      backdropScene: ctx.view(BACKDROP.sceneTemp),
    });
    const backdrops = this.backdrops;
    // nothing is drawn yet, so the scene pyramid never interrupts a step
    if (backdrops.hasScene) {
      this.buildPyramid(ctx, backdrops.scene, BACKDROP.sceneTemp);
    }

    const count = this.instances.getCount;
    if (count > 0) this.instances.upload();
    let step = this.beginStep(ctx, binds, true);
    // each group ends the step, blurs what is drawn so far and draws on top of it
    const groups = backdrops.getGroups;
    let first = 0;
    for (let i = 0; i < backdrops.getGroupCount; i++) {
      const group = groups[i];
      this.drawRange(step, first, group.start);
      step.end();
      this.buildPyramid(ctx, group, BACKDROP.temp);
      step = this.beginStep(ctx, binds, false);
      first = group.start;
    }
    this.drawRange(step, first, count);
    step.end();
    console.log(
      "scene",
      this.backdrops.hasScene,
      "groups",
      this.backdrops.getGroupCount,
    );
  }

  private beginStep(
    ctx: MultiPassContext,
    binds: GPUBindGroup,
    clear: boolean,
  ) {
    const step = ctx.beginRender("draw", {
      colors: [{ name: TARGET, clear: clear ? COLOR.TRANSPARENT : undefined }],
    });
    step.setBindGroup(2, binds);
    step.setVertexBuffer(0, this.instances.getBuffer);
    return step;
  }

  // call order is the order, one draw per run of the same material
  private drawRange(step: GPURenderPassEncoder, from: number, to: number) {
    const uints = this.instances.getUints;
    const stride = GUI_LAYOUT.stride;
    const offset = GUI_LAYOUT.offsets.materialClip;
    let first = from;
    while (first < to) {
      // the clip id in the high bits does not split a run, only the material does
      const id = materialOf(uints[first * stride + offset]);
      let end = first + 1;
      while (end < to && materialOf(uints[end * stride + offset]) === id) end++;
      // a material created after this build has no pipeline until the rebuild lands
      step.setPipeline(
        this.pipelines[id] ?? this.pipelines[DEFAULT_MATERIAL.id],
      );
      step.draw(6, end - first, 0, first);
      first = end;
    }
  }

  // mip 0 from the scene (and the gui so far), then each level blurs the one below,
  // all scissored to the region so the cost follows the glass area, not the screen
  private buildPyramid(
    ctx: MultiPassContext,
    region: BackdropRegion,
    temp: string,
  ) {
    const sceneOnly = temp === BACKDROP.sceneTemp;
    const labels = sceneOnly
      ? this.pyramidLabels.scene
      : this.pyramidLabels.group;
    // one level above the top for the blend, a bit more since the gpu level is f32
    const levels =
      Math.min(BACKDROP.levels - 1, Math.floor(region.top + 0.01) + 1) + 1;
    const margin = BACKDROP.margin * 2 ** levels;
    const scene = ctx.view("offscreenCanvas");
    const gui = ctx.output(TARGET);
    const { clamp } = AxiomMath;
    for (let level = 0; level < levels; level++) {
      const texel = 2 ** (level + 1);
      const size = ctx.size(temp, level);
      const left = clamp(
        Math.floor((region.minX - margin) / texel),
        0,
        size.width,
      );
      const top = clamp(
        Math.floor((region.minY - margin) / texel),
        0,
        size.height,
      );
      const right = clamp(
        Math.ceil((region.maxX + margin) / texel),
        0,
        size.width,
      );
      const bottom = clamp(
        Math.ceil((region.maxY + margin) / texel),
        0,
        size.height,
      );
      // off screen: nothing of the region gets drawn either
      if (right <= left || bottom <= top) return;

      const step = ctx.beginRender(labels[level], {
        colors: [{ name: temp, mip: level }],
      });
      let pipeline = this.pyramid.downsample;
      if (level === 0) {
        pipeline = sceneOnly ? this.pyramid.scene : this.pyramid.snapshot;
      }
      step.setPipeline(pipeline);
      step.setBindGroup(
        2,
        this.pyramidBinds.get({
          scene,
          gui,
          // mip 0 reads no source, any view other than the written mip fits the layout
          source: level === 0 ? gui : ctx.output(temp, level - 1),
        }),
      );
      step.setScissorRect(left, top, right - left, bottom - top);
      step.draw(3);
      step.end();
    }
  }
}

function labels(prefix: string) {
  return Array.from(
    { length: BACKDROP.levels },
    (_, level) => `${prefix}:mip${level}`,
  );
}
