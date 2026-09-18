import { assert } from "@axiom/utils";
import AssetManager, { ASSET_NAMES, AssetName } from "../../assetManager";
import Aurora from "../../core";
import {
  MultiPass,
  MultiPassContext,
  PassFormats,
  PassResources,
} from "../../pass";
import PassBinds, { PassBindEntries } from "../../passBinds";
import RenderGraph from "../../renderGraph";
import { DEPTH_FORMATS } from "../../resourcePool";
import shader from "../shaders/preview.wgsl?raw";

declare global {
  interface Window {
    GPUPreview?: PreviewPass;
  }
}

export interface PreviewOptions {
  name?: string;
  texture?: string;
  asset?: AssetName;
  mip?: number;
  layer?: number;
}
interface PreviewEntry {
  kind: "texture" | "asset" | "canvas";
  name: string;
  format?: GPUTextureFormat;
  width?: number;
  height?: number;
  layers?: number;
}
// selection outlives the instance, a preset may create a new pass on every rebuild
interface PreviewState {
  target: PreviewEntry | null;
  showCanvas: boolean;
  mip: number;
  layer: number;
  // assets are loaded after the pass may be created, so the default layer waits for the first build
  autoLayer: boolean;
}
interface PreviewBuild {
  target: PreviewEntry | null;
  mode: number;
  render: GPURenderPipeline | null;
  range: GPUComputePipeline | null;
}

const BINDS = {
  source: {
    binding: 0,
    type: "texture",
    sampleType: "unfilterable-float",
    dimension: "2d-array",
  },
  params: { binding: 1, type: "uniform" },
  range: { binding: 2, type: "storage" },
} satisfies PassBindEntries;
// mirrors MODE_* in preview.wgsl
const SHADER_MODE = { encode: 0, raw: 1, depth: 2 };
const CANVAS: PreviewEntry = { kind: "canvas", name: "canvas" };
// low starts at the largest bit pattern, high at zero
const RANGE_RESET = new Uint32Array([0xffffffff, 0]);

// debug pass, added by hand at the end of a preset; while in the graph it is window.GPUPreview
export default class PreviewPass extends MultiPass {
  private static states: Map<string, PreviewState> = new Map();
  public readonly name: string;
  private readonly state: PreviewState;
  // an instance reused across rebuilds keeps the pipelines of each build apart
  private builds: WeakMap<Readonly<PassResources>, PreviewBuild> = new WeakMap();
  private building: PreviewBuild | null = null;
  private gpu: {
    binds: PassBinds<typeof BINDS>;
    params: GPUBuffer;
    range: GPUBuffer;
  } | null = null;
  private paramsData = new Uint32Array(4);

  constructor({
    name = "preview",
    texture,
    asset,
    mip = 0,
    layer,
  }: PreviewOptions = {}) {
    super();
    assert(
      texture === undefined || asset === undefined,
      `PreviewPass "${name}" gets both texture and asset, pick one`,
    );
    this.name = name;
    const existing = PreviewPass.states.get(name);
    if (existing) {
      this.state = existing;
      return;
    }
    let target: PreviewEntry | null = null;
    if (texture !== undefined && texture !== CANVAS.name) {
      target = { kind: "texture", name: texture };
    }
    if (asset !== undefined) target = { kind: "asset", name: asset };
    this.state = {
      target,
      showCanvas: texture === CANVAS.name,
      mip,
      layer: layer ?? 0,
      autoLayer: layer === undefined,
    };
    PreviewPass.states.set(name, this.state);
  }

  public next() {
    this.step(1);
  }
  public prev() {
    this.step(-1);
  }
  public select(name: string) {
    const entries = this.entries();
    const entry =
      entries.find((entry) => entry.kind !== "asset" && entry.name === name) ??
      entries.find((entry) => entry.name === name) ??
      ({ kind: "texture", name } satisfies PreviewEntry);
    this.apply(entry, entries);
  }
  public inArrayNext() {
    this.stepLayer(1);
  }
  public inArrayPrev() {
    this.stepLayer(-1);
  }
  public reset() {
    this.select(CANVAS.name);
  }
  public setMip(level: number) {
    this.state.mip = Math.max(0, Math.floor(level));
    console.info(`[${this.name}] mip ${this.state.mip}`);
  }

  enabled() {
    if (this.state.target === null) this.pickFirst();
    return !this.state.showCanvas;
  }

  resources(res: PassResources) {
    const target = this.state.target;
    if (this.state.autoLayer && target !== null) {
      this.state.layer = this.defaultLayer(target);
      this.state.autoLayer = false;
    }
    if (target?.kind === "texture") res.read(target.name);
    if (target?.kind === "asset") res.readAsset(target.name as AssetName);
    res.writeCanvas({ loadOp: "clear", clearValue: [0, 0, 0, 1] });

    const build: PreviewBuild = {
      target,
      mode: SHADER_MODE.raw,
      render: null,
      range: null,
    };
    this.builds.set(res, build);
    this.building = build;
  }

  async setup(targets: PassFormats) {
    window.GPUPreview = this;
    const build = this.building!;
    const target = build.target;
    if (target === null) return;

    this.gpu ??= {
      binds: new PassBinds(this.name, BINDS),
      params: Aurora.device.createBuffer({
        label: `${this.name}Params`,
        size: this.paramsData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
      range: Aurora.device.createBuffer({
        label: `${this.name}DepthRange`,
        size: RANGE_RESET.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    };
    const format =
      target.kind === "texture"
        ? targets.formats.get(target.name)!
        : AssetManager.getAssetTexture(target.name as AssetName)!.format;
    build.mode = this.shaderMode(format);

    const layout = this.gpu.binds.layout;
    const [render, range] = await Promise.all([
      Aurora.createRenderPipeline(
        { colors: [Aurora.getCanvasFormat] },
        { label: this.name, shader, binds: layout },
      ),
      build.mode === SHADER_MODE.depth
        ? Aurora.createComputePipeline({
            label: `${this.name}Range`,
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

    const params = this.paramsData;
    params[0] = this.state.mip;
    params[1] = this.state.layer;
    params[2] = build.mode;
    Aurora.device.queue.writeBuffer(gpu.params, 0, params);

    const bindGroup = gpu.binds.get({
      source:
        target.kind === "texture"
          ? ctx.arrayView(target.name)
          : ctx.asset(target.name as AssetName),
      params: gpu.params,
      range: gpu.range,
    });

    if (build.range) {
      Aurora.device.queue.writeBuffer(gpu.range, 0, RANGE_RESET);
      const computePass = ctx.beginCompute("range");
      computePass.setPipeline(build.range);
      computePass.setBindGroup(2, bindGroup);
      Aurora.dispatch(computePass, ctx.size(target.name));
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
    if (window.GPUPreview === this) delete window.GPUPreview;
    this.gpu?.params.destroy();
    this.gpu?.range.destroy();
    this.gpu = null;
  }

  // graph textures in creation order, then enabled assets, the final image last
  private entries(): PreviewEntry[] {
    const entries: PreviewEntry[] = [];
    for (const texture of RenderGraph.describeResources()) {
      if (texture.kind === "graph") entries.push({ ...texture, kind: "texture" });
    }
    for (const name of ASSET_NAMES) {
      const texture = AssetManager.getAssetTexture(name);
      if (!AssetManager.hasAsset(name) || !texture) continue;
      entries.push({
        kind: "asset",
        name,
        format: texture.format,
        width: texture.width,
        height: texture.height,
        layers: texture.depthOrArrayLayers,
      });
    }
    entries.push(CANVAS);
    return entries;
  }

  private indexOf(entries: PreviewEntry[], entry: PreviewEntry | null) {
    return entries.findIndex(
      (candidate) =>
        candidate.kind === entry?.kind && candidate.name === entry?.name,
    );
  }

  private step(direction: 1 | -1) {
    const entries = this.entries();
    const index = this.indexOf(
      entries,
      this.state.showCanvas ? CANVAS : this.state.target,
    );
    const nextIndex =
      index === -1
        ? direction > 0
          ? 0
          : entries.length - 1
        : (index + direction + entries.length) % entries.length;
    this.apply(entries[nextIndex], entries);
  }

  private apply(entry: PreviewEntry, entries: PreviewEntry[]) {
    const index = this.indexOf(entries, entry);
    const position = `${index === -1 ? "?" : index}/${entries.length - 1}`;
    if (entry.kind === "canvas") {
      this.state.showCanvas = true;
      console.info(`[${this.name}] ${position} canvas (final image)`);
      return;
    }
    this.state.showCanvas = false;
    const target = this.state.target;
    if (target?.kind !== entry.kind || target.name !== entry.name) {
      this.setTarget(entry);
    }
    const details =
      entry.format === undefined
        ? "not used this frame"
        : `${entry.format} ${entry.width}x${entry.height}, layer ${this.state.layer}/${(entry.layers ?? 1) - 1}`;
    console.info(`[${this.name}] ${position} ${entry.name} (${entry.kind}) ${details}`);
  }

  private stepLayer(direction: 1 | -1) {
    const target = this.state.target;
    if (target === null || this.state.showCanvas) {
      console.info(`[${this.name}] no texture selected`);
      return;
    }
    const entry = this.entries().find(
      (candidate) =>
        candidate.kind === target.kind && candidate.name === target.name,
    );
    const layers = entry?.layers ?? 1;
    this.state.layer = (this.state.layer + direction + layers) % layers;
    console.info(
      `[${this.name}] ${target.name} layer ${this.state.layer}/${layers - 1}`,
    );
  }

  private setTarget(entry: PreviewEntry) {
    this.state.target = { kind: entry.kind, name: entry.name };
    this.state.mip = 0;
    this.state.layer = this.defaultLayer(entry);
    this.state.autoLayer = false;
    // deferred, so a rebuild never starts in the middle of resolving a frame
    queueMicrotask(() => void RenderGraph.rebuild());
  }

  // the list is complete here because the preview is the last pass of the preset
  private pickFirst() {
    const first = this.entries()[0];
    if (first.kind !== "canvas") this.setTarget(first);
  }

  // layer 0 of every asset array is the neutral one
  private defaultLayer(entry: PreviewEntry) {
    if (entry.kind !== "asset") return 0;
    const texture = AssetManager.getAssetTexture(entry.name as AssetName);
    return texture && texture.depthOrArrayLayers > 1 ? 1 : 0;
  }

  private shaderMode(format: GPUTextureFormat) {
    if (DEPTH_FORMATS.has(format)) return SHADER_MODE.depth;
    if (format.endsWith("-srgb")) return SHADER_MODE.encode;
    // float targets hold linear values only when the scene is linear
    if (format.includes("float") && Aurora.isLinear) return SHADER_MODE.encode;
    return SHADER_MODE.raw;
  }
}
