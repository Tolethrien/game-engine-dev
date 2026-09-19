import { assert } from "@axiom/utils";
import AxiomMath from "@axiom/math";
import Aurora, { RenderPipelineOptions } from "../../core";
import {
  MultiPass,
  MultiPassContext,
  PassFormats,
  PassResources,
  PipelineTargets,
} from "../../pass";
import PassBinds, { PassBindEntries } from "../../passBinds";
import GrowingBuffer from "../../utils/growingBuffer";
import VertexLayout, {
  VertexFields,
  VertexWriter,
} from "../../utils/vertexLayout";
import {
  CLIP,
  ClipShape,
  DEFAULT_MATERIAL,
  DrawApi,
  SHAPE,
} from "../drawApi";
import Material from "../../material";
import shader from "../shaders/draw.wgsl?raw";
import backdropShader from "../shaders/backdrop.wgsl?raw";
import type { URPSortConfig } from "../urpTypes";

const INSTANCE_FIELDS = {
  position: "float32x2",
  size: "float32x2",
  rotation: "float32",
  radius: "float32x4",
  outlineWidth: "float32",
  color: "unorm8x4",
  outlineColor: "unorm8x4",
  shape: "uint32",
  uvRect: "float32x4",
  layer: "uint32",
  sortPoint: "float32x3",
  params: "float32x4",
  // material id (cpu only, splits transparents into batches) | clip id << 16
  materialClip: "uint32",
} satisfies VertexFields;
const INSTANCE = new VertexLayout(INSTANCE_FIELDS, { stepMode: "instance" });
const BINDS = {
  sort: { binding: 0, type: "uniform" },
  backdrop: { binding: 1, type: "texture" },
  clips: { binding: 2, type: "storage", readOnly: true },
} satisfies PassBindEntries;
const BACKDROP_BINDS = {
  scene: { binding: 0, type: "texture" },
  gui: { binding: 1, type: "texture" },
  source: { binding: 2, type: "texture" },
} satisfies PassBindEntries;
// blur pyramid under gui backdrops: mip 0 is half the canvas, so a texel of level i spans 2^(i+1) px
const BACKDROP = Object.freeze({
  temp: "backdrop",
  levels: 6,
  // blur sigma of a level in its own texels, must match BACKDROP_SIGMA in draw.wgsl
  sigmaPerTexel: 0.8,
  // gaussian reach used to decide whether a backdrop still sees the same snapshot
  reach: 3,
  // top level texels kept around a group, garbage of earlier groups creeps in from the scissor edge
  margin: 6,
});
export type DrawWriter = VertexWriter<typeof INSTANCE_FIELDS>;

interface MaterialPipelines {
  opaque: GPURenderPipeline | null;
  transparent: GPURenderPipeline;
}
interface OpaqueBatch {
  buffer: GrowingBuffer;
  writer: DrawWriter;
}
interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
// backdrops sharing one snapshot of everything drawn before start
interface BackdropGroup extends Bounds {
  start: number;
  // highest continuous pyramid level any member samples
  top: number;
}
interface BackdropPipelines {
  compose: GPURenderPipeline;
  downsample: GPURenderPipeline;
}
export interface DrawPassOptions {
  name: string;
  space: "world" | "screen";
  target: string;
  sort: URPSortConfig;
  api: DrawApi<any>;
  // texture under the target, composed with it into the snapshot a gui backdrop blurs
  backdrop?: string;
}

export default class DrawPass extends MultiPass {
  private static readonly MATERIAL_MARKER = "// MATERIAL";
  public readonly name: string;
  public readonly sort: URPSortConfig;
  private readonly space: DrawPassOptions["space"];
  private readonly target: string;
  private readonly facade: DrawApi<any>;
  private readonly depthName: string;
  private readonly backdropSource: string | null;
  private readonly backdropLabels: string[];
  // axis indices (x 0, y 1, z 2), most significant first
  private readonly sortAxes: number[];
  // "gx+gy+z": slot y carries gx + gy + z (the diagonal), not sortPoint.y
  private readonly isoSort: boolean;
  private pipelines: MaterialPipelines[] = [];
  // null where the material never draws opaque (additive, forced transparent, mode none)
  private opaqueBatches: (OpaqueBatch | null)[] = [];
  declare private transparent: GrowingBuffer;
  declare private sorted: GrowingBuffer;
  declare private transparentWriter: DrawWriter;
  declare private binds: PassBinds<typeof BINDS>;
  declare private sortBuffer: GPUBuffer;
  declare private clips: GrowingBuffer;
  private keys = new Float64Array(64);
  private objectSortingRange = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  };
  // per axis x, y, z, float32 like the shader so both keys match
  private sortParams = {
    origin: new Float32Array(3),
    step: new Float32Array(3),
    count: new Float32Array(3),
    weight: new Float32Array(3),
    total: 1,
  };
  // SortParams in draw.wgsl: each row is vec3f + f32
  private sortData = new Float32Array(16);
  private clearColor: GPUColor = [0, 0, 0, 0];
  // transparent indices of backdrop instances, in call order
  private backdrops: number[] = [];
  private backdropGroups: BackdropGroup[] = [];
  private backdropGroupCount = 0;
  private scratchBounds: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  // everything drawn since the snapshot of the open group
  private drawnBounds: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  declare private backdropBinds: PassBinds<typeof BACKDROP_BINDS>;
  declare private backdropPipelines: BackdropPipelines;
  // world shares the shader and the group 2 layout, but has no backdrop to bind
  private placeholder: GPUTexture | null = null;
  declare private placeholderView: GPUTextureView;

  constructor({ name, space, target, sort, api, backdrop }: DrawPassOptions) {
    super();
    assert(
      backdrop === undefined || space === "screen",
      `DrawPass "${name}": backdrop needs space "screen", its bounds are canvas pixels`,
    );
    this.name = name;
    this.space = space;
    this.target = target;
    this.facade = api;
    this.sort = sort;
    this.depthName = `${name}Depth`;
    this.backdropSource = backdrop ?? null;
    this.backdropLabels = Array.from(
      { length: BACKDROP.levels },
      (_, level) => `backdrop:mip${level}`,
    );
    this.isoSort = sort.mode === "gx+gy+z";
    this.sortAxes =
      sort.mode === "none"
        ? []
        : sort.mode === "layer"
          ? [2]
          : this.isoSort
            ? [1, 2, 0]
            : sort.mode.split("+").map((axis) => "xyz".indexOf(axis));

    const { step, count } = this.sortParams;
    step.set([sort.step.x, sort.step.y, sort.step.z]);
    count[2] = Math.floor((sort.zRange[1] - sort.zRange[0]) / sort.step.z) + 1;
    this.sortParams.origin[2] = sort.zRange[0];
  }

  private get depthSorted() {
    return this.sort.mode !== "none";
  }

  async setup(targets: PassFormats) {
    assert(
      shader.includes(DrawPass.MATERIAL_MARKER),
      `draw.wgsl is missing the "${DrawPass.MATERIAL_MARKER}" marker`,
    );
    this.transparent = this.createBuffer(`${this.name}Transparent`);
    this.sorted = this.createBuffer(`${this.name}Sorted`);
    this.transparentWriter = INSTANCE.createWriter(this.transparent);
    this.binds = new PassBinds(this.name, BINDS);
    this.clips = new GrowingBuffer({
      label: `${this.name}Clips`,
      stride: CLIP.words,
      usage: GPUBufferUsage.STORAGE,
    });
    this.resetClips();
    this.sortBuffer = Aurora.device.createBuffer({
      label: `${this.name}Sort`,
      size: this.sortData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const materials = Material.getAll;
    assert(
      materials.length <= CLIP.materialMask + 1,
      `DrawPass "${this.name}": at most ${CLIP.materialMask + 1} materials, the rest of the instance word holds the clip id`,
    );
    for (const material of materials) {
      assert(
        /fn\s+material\s*\(/.test(material.fragment),
        `Material "${material.name}" must define fn material(in: MaterialInput) -> vec4f`,
      );
    }
    this.opaqueBatches = materials.map((material) => {
      if (!this.depthSorted || material.transparent) return null;
      const buffer = this.createBuffer(`${this.name}Opaque:${material.name}`);
      return { buffer, writer: INSTANCE.createWriter(buffer) };
    });
    const pipelineTargets: PipelineTargets = {
      colors: [targets.formats.get(this.target)!],
      depth: this.depthSorted ? targets.formats.get(this.depthName) : undefined,
    };
    const [pipelines] = await Promise.all([
      Promise.all(
        materials.map((material) =>
          this.createPipelines(pipelineTargets, material),
        ),
      ),
      this.setupBackdrop(targets),
    ]);
    this.pipelines = pipelines;

    this.facade.setTarget(this);
  }

  private async setupBackdrop(targets: PassFormats) {
    if (!this.backdropSource) {
      this.placeholder = Aurora.device.createTexture({
        label: `${this.name}BackdropPlaceholder`,
        size: [1, 1],
        format: "rgba16float",
        usage: GPUTextureUsage.TEXTURE_BINDING,
      });
      this.placeholderView = this.placeholder.createView();
      return;
    }
    // one bind group per pyramid level, each reads the level below
    this.backdropBinds = new PassBinds(
      `${this.name}Backdrop`,
      BACKDROP_BINDS,
      BACKDROP.levels + 1,
    );
    const colors = [targets.formats.get(BACKDROP.temp)!];
    const [compose, downsample] = await Promise.all(
      [true, false].map((compose) =>
        Aurora.createRenderPipeline(
          { colors },
          {
            label: `${this.name}Backdrop${compose ? "Compose" : "Downsample"}`,
            shader: backdropShader,
            binds: this.backdropBinds.layout,
            constants: { compose },
          },
        ),
      ),
    );
    this.backdropPipelines = { compose, downsample };
  }

  resources(res: PassResources) {
    res.readAsset("albedo");
    res.readAsset("ui");
    res.readAsset("fonts");
    // the first step of execute clears, a separate graph clear would cost an extra pass
    if (this.space === "screen") {
      res.sampler("linearClamp");
      this.clearColor = [0, 0, 0, 0];
      res.create(
        this.target,
        { size: { scale: 1, base: "canvas" }, format: "rgba16float" },
        { clear: false },
      );
    } else {
      const color = Aurora.getSettings.rendering.canvasColor;
      const alpha = color[3] / 255;
      res.sampler("nearestClamp");
      this.clearColor = [
        Aurora.colorChannel(color[0]) * alpha,
        Aurora.colorChannel(color[1]) * alpha,
        Aurora.colorChannel(color[2]) * alpha,
        alpha,
      ];
      res.create(
        this.target,
        { size: { scale: 1 }, format: "rgba16float" },
        { clear: false },
      );
    }
    if (this.depthSorted) {
      res.create(
        this.depthName,
        {
          size:
            this.space === "screen"
              ? { scale: 1, base: "canvas" }
              : { scale: 1 },
          format: "depth32float",
        },
        { clear: false },
      );
    }
    if (this.backdropSource) {
      res.read(this.backdropSource);
      res.temp(
        BACKDROP.temp,
        {
          size: { scale: 0.5, base: "canvas" },
          format: "rgba16float",
          mips: BACKDROP.levels,
        },
        { clear: false },
      );
    }
  }

  public instance(
    opaque: boolean,
    material: Material,
    clip: number,
    sortX: number,
    sortY: number,
    sortZ: number,
  ) {
    // comparisons skip NaN, one broken position must not poison the whole frame range
    const range = this.objectSortingRange;
    if (sortX < range.minX) range.minX = sortX;
    if (sortX > range.maxX) range.maxX = sortX;
    // iso: slot y tracks the diagonal gx + gy + z, computed like the shader (see sortKey)
    const slotY = this.isoSort
      ? Math.fround(Math.fround(sortX + sortY) + sortZ)
      : sortY;
    if (slotY < range.minY) range.minY = slotY;
    if (slotY > range.maxY) range.maxY = slotY;

    const id = this.pipelines[material.id] ? material.id : DEFAULT_MATERIAL.id;

    let writer = this.transparentWriter;
    const batch = opaque ? this.opaqueBatches[id] : null;
    if (batch) {
      writer = batch.writer;
      writer.at(batch.buffer.push());
    } else {
      writer.at(this.transparent.push());
    }
    writer.materialClip((id | (clip << CLIP.idBits)) >>> 0);
    writer.sortPoint(sortX, sortY, sortZ);
    return writer;
  }

  // id 0 is no clip, the parent chain is walked in the shader
  public pushClip(shape: ClipShape, parent: number) {
    const id = this.clips.push();
    assert(
      id < 2 ** CLIP.idBits,
      `DrawPass "${this.name}": more than ${2 ** CLIP.idBits - 1} clips in one frame`,
    );
    const base = id * CLIP.words;
    const floats = this.clips.getFloats;
    floats[base] = shape.x;
    floats[base + 1] = shape.y;
    floats[base + 2] = shape.width / 2;
    floats[base + 3] = shape.height / 2;
    floats.set(shape.radius, base + 4);
    floats[base + 8] = Math.cos(shape.rotation);
    floats[base + 9] = Math.sin(shape.rotation);
    this.clips.getUints[base + 10] = parent;
    return id;
  }

  private resetClips() {
    this.clips.clear();
    const base = this.clips.push() * CLIP.words;
    this.clips.getFloats.fill(0, base, base + CLIP.words);
  }

  // the instance just written is a backdrop, gui draws in call order so its index stays
  public markBackdrop() {
    this.backdrops.push(this.transparent.getCount - 1);
  }

  public beginFrame() {
    for (const batch of this.opaqueBatches) batch?.buffer.clear();
    this.transparent.clear();
    // sortTransparent (and its reserve) only runs on frames with transparents,
    // so a quiet-frame count on its own would never shrink this one back down
    this.sorted.clear();
    this.resetClips();
    this.backdrops.length = 0;
    const range = this.objectSortingRange;
    range.minX = Infinity;
    range.maxX = -Infinity;
    range.minY = Infinity;
    range.maxY = -Infinity;
  }

  execute(_encoder: GPUCommandEncoder, ctx: MultiPassContext) {
    this.updateSort();
    this.clips.upload();
    const binds = this.binds.get({
      sort: this.sortBuffer,
      clips: this.clips.getBuffer,
      backdrop: this.backdropSource
        ? ctx.view(BACKDROP.temp)
        : this.placeholderView,
    });
    let step = this.beginStep(ctx, true);
    step.setBindGroup(2, binds);

    // opaque: one draw per material, depth decides the order
    for (let id = 0; id < this.opaqueBatches.length; id++) {
      const pipeline = this.pipelines[id].opaque;
      const batch = this.opaqueBatches[id];
      if (!pipeline || !batch || batch.buffer.getCount === 0) continue;
      batch.buffer.upload();
      step.setPipeline(pipeline);
      step.setVertexBuffer(0, batch.buffer.getBuffer);
      step.draw(6, batch.buffer.getCount);
    }

    this.backdropGroupCount = 0;
    const count = this.transparent.getCount;
    if (count === 0) {
      step.end();
      return;
    }
    const buffer = this.depthSorted ? this.sortTransparent() : this.transparent;
    buffer.upload();
    if (this.backdropSource && this.backdrops.length > 0) {
      this.groupBackdrops(buffer);
    }

    // each group ends the step, blurs what is drawn so far and draws on top of it
    let first = 0;
    for (let i = 0; i < this.backdropGroupCount; i++) {
      const group = this.backdropGroups[i];
      this.drawTransparent(step, buffer, first, group.start);
      step.end();
      this.blurBackdrop(ctx, group);
      step = this.beginStep(ctx, false);
      step.setBindGroup(2, binds);
      first = group.start;
    }
    this.drawTransparent(step, buffer, first, count);
    step.end();
  }

  private beginStep(ctx: MultiPassContext, clear: boolean) {
    return ctx.beginRender("draw", {
      colors: [
        { name: this.target, clear: clear ? this.clearColor : undefined },
      ],
      depth: this.depthSorted
        ? { name: this.depthName, clear: clear ? 1 : undefined }
        : undefined,
    });
  }

  // transparent: keep the order, one draw per run of the same material
  private drawTransparent(
    step: GPURenderPassEncoder,
    buffer: GrowingBuffer,
    from: number,
    to: number,
  ) {
    if (from >= to) return;
    step.setVertexBuffer(0, buffer.getBuffer);
    const uints = buffer.getUints;
    const stride = INSTANCE.stride;
    const material = INSTANCE.offsets.materialClip;
    const mask = CLIP.materialMask;
    let first = from;
    while (first < to) {
      const id = uints[first * stride + material] & mask;
      let end = first + 1;
      while (end < to && (uints[end * stride + material] & mask) === id) end++;
      step.setPipeline(this.pipelines[id].transparent);
      step.draw(6, end - first, 0, first);
      first = end;
    }
  }

  // a backdrop joins the open group when nothing drawn since its snapshot
  // lies within its reach, otherwise it would miss what is under it
  private groupBackdrops(buffer: GrowingBuffer) {
    const floats = buffer.getFloats;
    const uints = buffer.getUints;
    const bounds = this.scratchBounds;
    const drawn = this.drawnBounds;
    const params = INSTANCE.offsets.params;
    let group: BackdropGroup | null = null;
    let cursor = 0;

    for (const index of this.backdrops) {
      if (group) {
        for (let i = cursor; i < index; i++) {
          this.instanceBounds(floats, uints, i, bounds);
          this.grow(drawn, bounds);
        }
      }
      cursor = index;
      const sigma = floats[index * INSTANCE.stride + params];
      const reach = sigma * BACKDROP.reach;
      this.instanceBounds(floats, uints, index, bounds);
      const seesDrawn =
        bounds.minX - reach < drawn.maxX &&
        bounds.maxX + reach > drawn.minX &&
        bounds.minY - reach < drawn.maxY &&
        bounds.maxY + reach > drawn.minY;

      if (group && !seesDrawn) {
        this.grow(group, bounds);
        group.top = Math.max(group.top, this.backdropLevel(sigma));
        continue;
      }
      group = this.nextGroup();
      group.start = index;
      group.minX = bounds.minX;
      group.minY = bounds.minY;
      group.maxX = bounds.maxX;
      group.maxY = bounds.maxY;
      group.top = this.backdropLevel(sigma);
      drawn.minX = Infinity;
      drawn.minY = Infinity;
      drawn.maxX = -Infinity;
      drawn.maxY = -Infinity;
    }
  }

  private nextGroup() {
    const groups = this.backdropGroups;
    if (this.backdropGroupCount === groups.length) {
      groups.push({ start: 0, minX: 0, minY: 0, maxX: 0, maxY: 0, top: 0 });
    }
    return groups[this.backdropGroupCount++];
  }

  private grow(target: Bounds, bounds: Bounds) {
    if (bounds.minX < target.minX) target.minX = bounds.minX;
    if (bounds.minY < target.minY) target.minY = bounds.minY;
    if (bounds.maxX > target.maxX) target.maxX = bounds.maxX;
    if (bounds.maxY > target.maxY) target.maxY = bounds.maxY;
  }

  // must match the level pick in draw.wgsl
  private backdropLevel(sigma: number) {
    const level = Math.log2(sigma / BACKDROP.sigmaPerTexel) - 1;
    return AxiomMath.clamp(level, 0, BACKDROP.levels - 1);
  }

  // mirrors the quad the vertex shader builds, in canvas pixels
  private instanceBounds(
    floats: Float32Array,
    uints: Uint32Array,
    index: number,
    out: Bounds,
  ) {
    const base = index * INSTANCE.stride;
    const { position, size, radius, rotation, outlineWidth, params, shape } =
      INSTANCE.offsets;
    const x = floats[base + position];
    const y = floats[base + position + 1];
    const kind = uints[base + shape];
    if (kind === SHAPE.QUAD) {
      // quads pack their 4 points into position, size and radius
      const bx = floats[base + size];
      const by = floats[base + size + 1];
      const cx = floats[base + radius];
      const cy = floats[base + radius + 1];
      const dx = floats[base + radius + 2];
      const dy = floats[base + radius + 3];
      out.minX = Math.min(x, bx, cx, dx) - 1;
      out.minY = Math.min(y, by, cy, dy) - 1;
      out.maxX = Math.max(x, bx, cx, dx) + 1;
      out.maxY = Math.max(y, by, cy, dy) + 1;
      return;
    }
    const halfWidth = floats[base + size] / 2;
    const halfHeight = floats[base + size + 1] / 2;
    // antialiasing margin plus the half pixel of anchor snapping
    let pad = 1.5;
    if (kind === SHAPE.SHADOW) {
      pad +=
        Math.max(
          Math.abs(floats[base + params]),
          Math.abs(floats[base + params + 1]),
        ) +
        Math.max(floats[base + params + 2], 0) +
        1.5 * floats[base + outlineWidth];
    }
    const angle = floats[base + rotation];
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const extentX = cos * (halfWidth + pad) + sin * (halfHeight + pad);
    const extentY = sin * (halfWidth + pad) + cos * (halfHeight + pad);
    const centerX = x + halfWidth;
    const centerY = y + halfHeight;
    out.minX = centerX - extentX;
    out.minY = centerY - extentY;
    out.maxX = centerX + extentX;
    out.maxY = centerY + extentY;
  }

  // snapshot of scene + gui drawn so far into mip 0, then each level blurs the one below,
  // all scissored to the group so the cost follows the glass area, not the screen
  private blurBackdrop(ctx: MultiPassContext, group: BackdropGroup) {
    // one level above the top for the blend, a bit more since the gpu level is f32
    const levels =
      Math.min(BACKDROP.levels - 1, Math.floor(group.top + 0.01) + 1) + 1;
    const margin = BACKDROP.margin * 2 ** levels;
    const scene = ctx.view(this.backdropSource!);
    const gui = ctx.output(this.target);
    for (let level = 0; level < levels; level++) {
      const texel = 2 ** (level + 1);
      const size = ctx.size(BACKDROP.temp, level);
      const { clamp } = AxiomMath;
      const left = clamp(Math.floor((group.minX - margin) / texel), 0, size.width);
      const top = clamp(Math.floor((group.minY - margin) / texel), 0, size.height);
      const right = clamp(Math.ceil((group.maxX + margin) / texel), 0, size.width);
      const bottom = clamp(Math.ceil((group.maxY + margin) / texel), 0, size.height);
      // off screen: nothing of the group gets drawn either
      if (right <= left || bottom <= top) return;

      const step = ctx.beginRender(this.backdropLabels[level], {
        colors: [{ name: BACKDROP.temp, mip: level }],
      });
      step.setPipeline(
        level === 0
          ? this.backdropPipelines.compose
          : this.backdropPipelines.downsample,
      );
      step.setBindGroup(
        2,
        this.backdropBinds.get({
          scene,
          gui,
          // compose reads no source, any view other than the written mip fits the layout
          source: level === 0 ? gui : ctx.output(BACKDROP.temp, level - 1),
        }),
      );
      step.setScissorRect(left, top, right - left, bottom - top);
      step.draw(3);
      step.end();
    }
  }

  destroy() {
    this.facade.clearTarget(this);
    for (const batch of this.opaqueBatches) batch?.buffer.destroy();
    this.transparent.destroy();
    this.sorted.destroy();
    this.sortBuffer.destroy();
    this.clips.destroy();
    this.placeholder?.destroy();
  }

  private async createPipelines(
    targets: PipelineTargets,
    material: Material,
  ): Promise<MaterialPipelines> {
    const sorted = this.depthSorted;
    const options: RenderPipelineOptions = {
      label: `${this.name}:${material.name}`,
      shader: shader.replace(DrawPass.MATERIAL_MARKER, material.fragment),
      buffers: [INSTANCE.layout],
      blend: material.gpuBlend,
      binds: this.binds.layout,
    };
    const constants = {
      linearColors: Aurora.isLinear,
      depthSort: sorted,
      screenSpace: this.space === "screen",
      isoSort: this.isoSort,
    };

    const [opaque, transparent] = await Promise.all([
      sorted && !material.transparent
        ? Aurora.createRenderPipeline(targets, {
            ...options,
            label: `${this.name}Opaque:${material.name}`,
            depth: { write: true },
            constants: { ...constants, opaquePass: true },
          })
        : null,
      Aurora.createRenderPipeline(targets, {
        ...options,
        label: `${this.name}Transparent:${material.name}`,
        depth: sorted ? { write: false } : undefined,
        constants: { ...constants, opaquePass: false },
      }),
    ]);
    return { opaque, transparent };
  }

  private updateSort() {
    const range = this.objectSortingRange;
    const { origin, step, count, weight } = this.sortParams;
    const empty = range.minX > range.maxX;

    origin[0] = empty ? 0 : range.minX;
    origin[1] = empty ? 0 : range.minY;
    count[0] = empty ? 1 : Math.floor((range.maxX - range.minX) / step[0]) + 1;
    count[1] = empty ? 1 : Math.floor((range.maxY - range.minY) / step[1]) + 1;

    weight.fill(0);
    let total = 1;
    for (let i = this.sortAxes.length - 1; i >= 0; i--) {
      const axis = this.sortAxes[i];
      weight[axis] = total;
      total *= count[axis];
    }
    this.sortParams.total = total;

    const data = this.sortData;
    data.set(origin, 0);
    data[3] = total;
    data.set(step, 4);
    data.set(count, 8);
    data.set(weight, 12);
    Aurora.device.queue.writeBuffer(this.sortBuffer, 0, data);
  }

  // must match sortDepth in draw.wgsl
  private sortKey(floats: Float32Array, point: number) {
    const { origin, step, count, weight } = this.sortParams;
    let key = 0;
    for (let i = 0; i < this.sortAxes.length; i++) {
      const axis = this.sortAxes[i];
      // iso: slot y reads gx + gy + z instead of sortPoint.y, summed in
      // float32 like the shader so CPU and GPU never disagree at a step edge
      const value =
        this.isoSort && axis === 1
          ? Math.fround(
              Math.fround(floats[point] + floats[point + 1]) +
                floats[point + 2],
            )
          : floats[point + axis];
      const index = Math.floor((value - origin[axis]) / step[axis]);
      key += AxiomMath.clamp(index, 0, count[axis] - 1) * weight[axis];
    }
    return key;
  }

  private sortTransparent() {
    const count = this.transparent.getCount;
    if (this.keys.length < count) {
      this.keys = new Float64Array(2 ** Math.ceil(Math.log2(count)));
    }
    const floats = this.transparent.getFloats;
    const stride = INSTANCE.stride;
    const sortPoint = INSTANCE.offsets.sortPoint;
    // hot path: keys are integers < 2^24 and count < 2^29 in practice, so
    // key * count + index fits Float64 exactly (< 2^53) and the native sort
    // (no comparator callback) can order both at once, index recovered by % count
    const keys = this.keys.subarray(0, count);
    for (let i = 0; i < count; i++) {
      keys[i] = this.sortKey(floats, i * stride + sortPoint) * count + i;
    }
    keys.sort();

    this.sorted.reserve(count);
    const source = this.transparent.getUints;
    const target = this.sorted.getUints;
    for (let i = 0; i < count; i++) {
      const from = (keys[i] % count) * stride;
      const to = i * stride;
      for (let w = 0; w < stride; w++) target[to + w] = source[from + w];
    }
    return this.sorted;
  }

  private createBuffer(label: string) {
    return new GrowingBuffer({
      label,
      stride: INSTANCE.stride,
      usage: GPUBufferUsage.VERTEX,
    });
  }

  counters() {
    let opaque = 0;
    for (const batch of this.opaqueBatches)
      opaque += batch?.buffer.getCount ?? 0;
    const counters: Record<string, number> = {
      total: opaque + this.transparent.getCount,
      opaque,
      transparent: this.transparent.getCount,
    };
    counters.clips = this.clips.getCount - 1;
    if (this.backdropSource) {
      counters["backdrop groups"] = this.backdropGroupCount;
    }
    if (this.depthSorted) {
      // depth32float keeps whole numbers exact up to 2^24, above 100 neighbours can share depth
      const used = (this.sortParams.total / 2 ** 24) * 100;
      counters["sort depth used %"] = Math.round(used * 10) / 10;
    }
    return counters;
  }
}
