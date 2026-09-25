import { debug } from "@debug";
import AssetManager, { ASSET_NAMES, AssetName } from "@aurora/assetManager";
import Aurora from "@aurora/core";
import {
  MultiPass,
  MultiPassContext,
  PassFormats,
  PassResources,
} from "@aurora/pass";
import PassBinds, { PassBindEntries } from "@aurora/passBinds";
import RenderGraph from "@aurora/renderGraph";
import ResourcePool, { DEPTH_FORMATS } from "@aurora/resourcePool";
import FixedBuffer from "@aurora/utils/fixedBuffer";
import { AuroraUsage } from "@aurora/utils/usage";
import previewShader from "../shaders/previewShader.wgsl?raw";

type PreviewKind = "texture" | "asset" | "reserved";
type PreviewDimension = "2d" | "3d";
export interface PreviewEntry {
  label: string;
  kind: PreviewKind;
  name: string;
  format: GPUTextureFormat;
  width: number;
  height: number;
  // depth of a 3d texture
  layers: number;
  mips: number;
  dimension: PreviewDimension;
}
export interface TexturePreview {
  entries(): PreviewEntry[];
  get getSelection(): { target: string; layer: number; mip: number };
  get getWritten(): boolean;
  select(label: string): void;
  setLayer(layer: number): void;
  setMip(mip: number): void;
}
interface PreviewTarget {
  kind: PreviewKind;
  name: string;
}
interface PreviewBuild {
  target: PreviewTarget | null;
  mode: number;
  dimension: PreviewDimension;
  render: GPURenderPipeline | null;
  range: GPUComputePipeline | null;
}

const OFF = "off";
// mirrors MODE_* in previewShader.wgsl
const SHADER_MODE = Object.freeze({ encode: 0, raw: 1, depth: 2 });
// low starts at the largest bit pattern, high at zero
const RANGE_RESET = new Uint32Array([0xffffffff, 0]);
// fills // SOURCE in previewShader.wgsl, a 3d texture needs its own binding type
const SOURCE: Record<PreviewDimension, string> = {
  "2d": `
@group(2) @binding(0) var source: texture_2d_array<f32>;
fn sourceSize(mip: u32) -> vec2u { return textureDimensions(source, mip); }
fn sourceLayers(mip: u32) -> u32 { return textureNumLayers(source); }
fn load(coord: vec2u, index: u32, mip: u32) -> vec4f { return textureLoad(source, coord, index, mip); }
`,
  "3d": `
@group(2) @binding(0) var source: texture_3d<f32>;
fn sourceSize(mip: u32) -> vec2u { return textureDimensions(source, mip).xy; }
fn sourceLayers(mip: u32) -> u32 { return textureDimensions(source, mip).z; }
fn load(coord: vec2u, index: u32, mip: u32) -> vec4f { return textureLoad(source, vec3u(coord, index), mip); }
`,
};
const previewBinds = (dimension: GPUTextureViewDimension) =>
  ({
    source: {
      binding: 0,
      type: "texture",
      sampleType: "unfilterable-float",
      dimension,
    },
    params: { binding: 1, type: "uniform" },
    range: { binding: 2, type: "storage" },
  }) satisfies PassBindEntries;
type PreviewBinds = PassBinds<ReturnType<typeof previewBinds>>;

// outlives the pass, a preset creates a new instance on every build
const previewState = {
  target: null as PreviewTarget | null,
  layer: 0,
  mip: 0,
  // counted in clearFrame, so a pass that dropped out of the frame reads as not written
  frame: 0,
  executedFrame: -2,
};

const labelOf = ({ kind, name }: PreviewTarget) =>
  kind === "texture" ? name : `${kind}/${name}`;

const describe = (
  kind: PreviewKind,
  name: string,
  texture: GPUTexture,
): PreviewEntry => ({
  label: labelOf({ kind, name }),
  kind,
  name,
  format: texture.format,
  width: texture.width,
  height: texture.height,
  layers: texture.depthOrArrayLayers,
  mips: texture.mipLevelCount,
  dimension: texture.dimension === "3d" ? "3d" : "2d",
});

// temps are skipped: they go back to the pool before anything could read them
const previewEntries = (): PreviewEntry[] => {
  const entries: PreviewEntry[] = [];
  for (const texture of RenderGraph.describeResources()) {
    if (texture.kind !== "graph") continue;
    entries.push({
      label: labelOf({ kind: "texture", name: texture.name }),
      kind: "texture",
      name: texture.name,
      format: texture.format,
      width: texture.width,
      height: texture.height,
      layers: texture.layers,
      mips: texture.mips,
      dimension: "2d",
    });
  }
  for (const name of ASSET_NAMES) {
    const texture = AssetManager.getAssetTexture(name);
    if (!AssetManager.hasAsset(name) || !texture) continue;
    entries.push(describe("asset", name, texture));
  }
  ResourcePool.getReserved.forEach(({ texture }, name) =>
    entries.push(describe("reserved", name, texture)),
  );
  return entries;
};

// layer 0 of every asset array is the neutral one
const defaultLayer = (entry: PreviewEntry) =>
  entry.kind === "asset" && entry.layers > 1 ? 1 : 0;

const rebuild = () => queueMicrotask(() => void RenderGraph.rebuild());

export const texturePreview: TexturePreview = {
  entries: previewEntries,
  get getSelection() {
    const target = previewState.target;
    return {
      target: target ? labelOf(target) : OFF,
      layer: previewState.layer,
      mip: previewState.mip,
    };
  },
  get getWritten() {
    return (
      previewState.target !== null &&
      previewState.frame - previewState.executedFrame <= 1
    );
  },
  // the read is declared per build, so a new texture needs a rebuild; layer and mip do not
  select(label: string) {
    const current = previewState.target;
    if (label === OFF) {
      if (current === null) return;
      previewState.target = null;
      rebuild();
      return;
    }
    if (current && labelOf(current) === label) return;
    const entry = previewEntries().find((entry) => entry.label === label);
    if (!entry) {
      debug.log
        .scope("auroraURP")
        .once(`preview|unknown|${label}`)
        .warn(`Texture preview: "${label}" is not in the graph, assets or reserved textures`);
      return;
    }
    previewState.target = { kind: entry.kind, name: entry.name };
    previewState.mip = 0;
    previewState.layer = defaultLayer(entry);
    rebuild();
  },
  setLayer(layer: number) {
    previewState.layer = Math.max(0, Math.floor(layer));
  },
  setMip(mip: number) {
    previewState.mip = Math.max(0, Math.floor(mip));
  },
};

// debug pass added by hand at the end of a preset, steered by the texturePreview() panel
export default class PreviewPass extends MultiPass {
  name = "preview";
  // an instance reused across rebuilds keeps the pipelines of each build apart
  private builds: WeakMap<Readonly<PassResources>, PreviewBuild> = new WeakMap();
  private building: PreviewBuild | null = null;
  private gpu: {
    binds: Record<PreviewDimension, PreviewBinds>;
    params: FixedBuffer;
    range: GPUBuffer;
  } | null = null;
  private unregister: (() => void) | null = null;

  enabled() {
    return previewState.target !== null;
  }
  clearFrame() {
    previewState.frame++;
  }

  resources(res: PassResources) {
    const target = this.available(res) ? previewState.target : null;
    if (target?.kind === "texture") res.read(target.name);
    if (target?.kind === "asset") res.readAsset(target.name as AssetName);
    if (target?.kind === "reserved") res.readReserved(target.name);
    res.writeCanvas({ loadOp: "clear", clearValue: [0, 0, 0, 255] });

    const build: PreviewBuild = {
      target,
      mode: SHADER_MODE.raw,
      dimension: "2d",
      render: null,
      range: null,
    };
    this.builds.set(res, build);
    this.building = build;
  }

  // registered here, not in the constructor: a preset may create an instance whose build is dropped
  async setup(targets: PassFormats) {
    this.unregister = debug.aurora.texturePreview(texturePreview);
    const build = this.building!;
    const target = build.target;
    if (target === null) return;

    this.gpu ??= {
      binds: {
        "2d": new PassBinds(`${this.name}:2d`, previewBinds("2d-array")),
        "3d": new PassBinds(`${this.name}:3d`, previewBinds("3d")),
      },
      // laid out like Params in previewShader.wgsl
      params: new FixedBuffer({
        label: `${this.name}:params`,
        words: 4,
        usage: AuroraUsage.uniform,
      }),
      range: Aurora.device.createBuffer({
        label: `${this.name}:depthRange`,
        size: RANGE_RESET.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    };
    const source =
      target.kind === "texture" ? null : this.sourceTexture(target);
    const format = source?.format ?? targets.formats.get(target.name)!;
    build.dimension = source?.dimension === "3d" ? "3d" : "2d";
    build.mode = this.shaderMode(format);

    const shader = previewShader.replace("// SOURCE", SOURCE[build.dimension]);
    const layout = this.gpu.binds[build.dimension].layout;
    const label = `${this.name}:${build.dimension}`;
    const [render, range] = await Promise.all([
      Aurora.createRenderPipeline(
        { colors: [Aurora.getCanvasFormat] },
        { label, shader, binds: layout },
      ),
      build.mode === SHADER_MODE.depth
        ? Aurora.createComputePipeline({
            label: `${label}:range`,
            shader,
            binds: layout,
          })
        : null,
    ]);
    build.render = render;
    build.range = range;
  }

  execute(encoder: GPUCommandEncoder, ctx: MultiPassContext) {
    const build = this.builds.get(ctx.getResources);
    const gpu = this.gpu;
    if (!build?.target || !build.render || !gpu) return;
    const target = build.target;
    previewState.executedFrame = previewState.frame;

    const params = gpu.params.uints;
    params[0] = previewState.mip;
    params[1] = previewState.layer;
    params[2] = build.mode;
    gpu.params.upload();

    const bindGroup = gpu.binds[build.dimension].get({
      source: this.sourceView(target, build.dimension, ctx),
      params: gpu.params.getBuffer,
      range: gpu.range,
    });

    if (build.range) {
      Aurora.device.queue.writeBuffer(gpu.range, 0, RANGE_RESET);
      const computePass = ctx.beginCompute("range");
      computePass.setPipeline(build.range);
      computePass.setBindGroup(2, bindGroup);
      Aurora.dispatch(computePass, this.sourceSize(target, ctx));
      computePass.end();
    }

    const renderPass = ctx.beginRender("view", {
      colors: [{ name: "canvas" }],
    });
    renderPass.setPipeline(build.render);
    renderPass.setBindGroup(2, bindGroup);
    renderPass.draw(6);
    renderPass.end();
  }

  destroy() {
    this.unregister?.();
    this.unregister = null;
    this.gpu?.params.destroy();
    this.gpu?.range.destroy();
    this.gpu = null;
  }

  // a read of a texture that is gone (another preset, disabled asset, freed reservation) would fail the build
  private available(res: PassResources) {
    const target = previewState.target;
    if (target === null) return false;
    const exists =
      target.kind === "texture"
        ? res.created(target.name)
        : target.kind === "asset"
          ? AssetManager.hasAsset(target.name as AssetName)
          : ResourcePool.getReserved.has(target.name);
    if (exists) return true;
    const label = labelOf(target);
    debug.log
      .scope("auroraURP")
      .once(`preview|missing|${label}`)
      .warn(`Texture preview: "${label}" no longer exists, preview turned off`);
    previewState.target = null;
    return false;
  }

  private sourceTexture(target: PreviewTarget) {
    return target.kind === "asset"
      ? AssetManager.getAssetTexture(target.name as AssetName)!
      : ResourcePool.reservedTexture(target.name).texture;
  }

  private sourceView(
    target: PreviewTarget,
    dimension: PreviewDimension,
    ctx: MultiPassContext,
  ) {
    if (target.kind === "texture") return ctx.arrayView(target.name);
    if (target.kind === "asset") return ctx.asset(target.name as AssetName);
    return dimension === "3d"
      ? ctx.reserved(target.name)
      : ctx.reservedArrayView(target.name);
  }

  private sourceSize(target: PreviewTarget, ctx: MultiPassContext): Size2D {
    if (target.kind === "texture") return ctx.size(target.name);
    const texture = this.sourceTexture(target);
    return { width: texture.width, height: texture.height };
  }

  private shaderMode(format: GPUTextureFormat) {
    if (DEPTH_FORMATS.has(format)) return SHADER_MODE.depth;
    if (format.endsWith("-srgb")) return SHADER_MODE.encode;
    // float targets hold linear values only when the scene is linear
    if (format.includes("float") && Aurora.isLinear) return SHADER_MODE.encode;
    return SHADER_MODE.raw;
  }
}
