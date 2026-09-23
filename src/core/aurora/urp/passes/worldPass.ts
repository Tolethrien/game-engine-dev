import Aurora from "@aurora/core";
import {
  PassContext,
  PassResources,
  PassTargets,
  RenderPass,
} from "@aurora/pass";
import GrowingBuffer from "@aurora/utils/growingBuffer";
import { AuroraUsage } from "@aurora/utils/usage";
import DrawWorldShader from "../shaders/drawWorldShader.wgsl?raw";
import { worldDraw } from "../draw/drawWorld";
import { WORLD_LAYOUT, WorldWriter } from "../draw/drawInternal";
import { DEFAULT_MATERIAL } from "../draw/materials";
import Material from "../../material";
import type { SortProps } from "../urp";
import AxiomMath from "@/core/axiom/math";
import PassBinds, { PassBindEntries } from "../../passBinds";
import FixedBuffer from "../../utils/fixedBuffer";
import ClipBuffer from "../clip/clipBuffer";
import { CLIP, materialOf } from "../clip/clip";
import { assert } from "@axiom/utils";
interface SorterFrameProps {
  sortAxes: number[];
  frameMinX: number;
  frameMaxX: number;
  frameMinY: number;
  frameMaxY: number;
}
interface MaterialPipelines {
  // null where the material never draws opaque (transparent, additive, sorting off)
  opaque: GPURenderPipeline | null;
  transparent: GPURenderPipeline;
}
interface OpaqueBatch {
  buffer: GrowingBuffer;
  writer: WorldWriter;
}
const WORLD_BINDS = {
  sort: { binding: 0, type: "uniform" },
  clips: { binding: 1, type: "storage", readOnly: true },
} satisfies PassBindEntries;

export default class WorldPass extends RenderPass {
  name: string = "WorldPass";
  category = "world";
  private vertexBuffer = new GrowingBuffer({
    label: "worldPassVertex",
    stride: WORLD_LAYOUT.stride,
    usage: AuroraUsage.buffer.VERTEX,
  });
  private readonly frameStats = {
    opaque: 0,
    transparent: 0,
    instanceBytes: 0,
    uploadedBytes: 0,
  };
  private keys = new Float64Array(64);
  private sorted = new GrowingBuffer({
    label: "worldPassSorted",
    stride: WORLD_LAYOUT.stride,
    usage: AuroraUsage.buffer.VERTEX,
  });
  // both indexed by material id
  declare private pipelines: MaterialPipelines[];
  declare private opaqueBatches: (OpaqueBatch | null)[];
  private writer = WORLD_LAYOUT.createWriter(this.vertexBuffer);
  declare private sorter: SortProps & SorterFrameProps;
  declare private sortUniform: FixedBuffer;
  declare private binds: PassBinds<typeof WORLD_BINDS>;
  private clips = new ClipBuffer("worldPassClips");
  // views into sortUniform, laid out like SortParams in the shader; f32 so cpu and gpu keys round the same
  declare private sortParams: {
    origin: Float32Array;
    step: Float32Array;
    count: Float32Array;
    weight: Float32Array;
  };
  constructor(props: SortProps) {
    super();
    this.sorter = {
      ...props,
      sortAxes: this.sortAxes(props.sortMode),
      frameMinX: Infinity,
      frameMaxX: -Infinity,
      frameMinY: Infinity,
      frameMaxY: -Infinity,
    };
  }
  destroy() {
    this.vertexBuffer.destroy();
    this.sorted.destroy();
    this.sortUniform.destroy();
    this.clips.destroy();
    for (const batch of this.opaqueBatches) batch?.buffer.destroy();
  }
  public push(opaque: boolean, material: Material): WorldWriter {
    const batch = opaque ? this.opaqueBatches[material.id] : null;
    if (batch) {
      batch.writer.at(batch.buffer.push());
      return batch.writer;
    }
    this.writer.at(this.vertexBuffer.push());
    return this.writer;
  }
  stats() {
    const stats = this.frameStats;
    const sorting = this.sorter.sortAxes.length > 0;
    stats.opaque = 0;
    stats.instanceBytes = this.vertexBuffer.getGpuBytes + this.sorted.getGpuBytes;
    stats.uploadedBytes = (sorting ? this.sorted : this.vertexBuffer).getUsedBytes;
    for (const batch of this.opaqueBatches) {
      if (!batch) continue;
      stats.opaque += batch.buffer.getCount;
      stats.instanceBytes += batch.buffer.getGpuBytes;
      stats.uploadedBytes += batch.buffer.getUsedBytes;
    }
    stats.transparent = this.vertexBuffer.getCount;
    return stats;
  }
  public get getClips() {
    return this.clips;
  }
  public get getSortAnchor() {
    return this.sorter.sortAnchor;
  }
  public get getSortMode() {
    return this.sorter.sortMode;
  }
  public trackSortPoint(x: number, y: number) {
    if (x < this.sorter.frameMinX) this.sorter.frameMinX = x;
    if (x > this.sorter.frameMaxX) this.sorter.frameMaxX = x;
    if (y < this.sorter.frameMinY) this.sorter.frameMinY = y;
    if (y > this.sorter.frameMaxY) this.sorter.frameMaxY = y;
  }

  async setup(targets: PassTargets) {
    const { step, zRange } = this.sorter;
    this.sortUniform = new FixedBuffer({
      label: "worldPassSort",
      words: 16,
      usage: AuroraUsage.uniform,
    });
    const floats = this.sortUniform.floats;
    this.sortParams = {
      origin: floats.subarray(0, 3),
      step: floats.subarray(4, 7),
      count: floats.subarray(8, 11),
      weight: floats.subarray(12, 15),
    };
    this.sortParams.step.set([step.x, step.y, step.z]);
    this.sortParams.origin[2] = zRange[0];
    this.sortParams.count[2] = Math.floor((zRange[1] - zRange[0]) / step.z) + 1;

    this.binds = new PassBinds("worldPass", WORLD_BINDS);
    const sorting = this.sorter.sortAxes.length > 0;
    const materials = Material.getAll;
    assert(
      materials.length <= CLIP.materialMask + 1,
      `WorldPass: at most ${CLIP.materialMask + 1} materials, the rest of materialClip holds the clip id`,
    );
    this.opaqueBatches = materials.map((material) => {
      if (!sorting || material.transparent) return null;
      const buffer = new GrowingBuffer({
        label: `worldPassOpaque:${material.name}`,
        stride: WORLD_LAYOUT.stride,
        usage: AuroraUsage.buffer.VERTEX,
      });
      return { buffer, writer: WORLD_LAYOUT.createWriter(buffer) };
    });
    this.pipelines = await Promise.all(
      materials.map((material) =>
        this.createPipelines(targets, material, sorting),
      ),
    );
    worldDraw.setTarget(this);
  }
  resources(res: PassResources) {
    res.readAsset("albedo");
    res.readAsset("ui");
    res.readAsset("fonts");
    res.create(
      "offscreenCanvas",
      {
        format: "rgba16float",
        size: { scale: 1, base: "render" },
        label: "offscreenCanvas",
      },
      { clear: true, clearValue: Aurora.getSettings.rendering.canvasColor },
    );
    res.create(
      "DepthTest",
      {
        format: "depth32float",
        size: { scale: 1, base: "render" },
        label: "offscreenCanvasDepth",
      },
      { clear: true, depthClearValue: 1 },
    );

    res.sampler("nearestClamp");
  }
  clearFrame() {
    this.vertexBuffer.clear();
    this.sorted.clear();
    for (const batch of this.opaqueBatches) batch?.buffer.clear();
    this.clips.reset();
    worldDraw.clearFrame();
    this.sorter.frameMinX = Infinity;
    this.sorter.frameMaxX = -Infinity;
    this.sorter.frameMinY = Infinity;
    this.sorter.frameMaxY = -Infinity;
  }

  execute(encoder: GPURenderPassEncoder, ctx: PassContext): void {
    const sorting = this.sorter.sortAxes.length > 0;
    if (sorting) this.updateSorter();
    this.clips.upload();
    encoder.setBindGroup(
      2,
      this.binds.get({
        sort: this.sortUniform.getBuffer,
        clips: this.clips.getBuffer,
      }),
    );

    for (let id = 0; id < this.opaqueBatches.length; id++) {
      const batch = this.opaqueBatches[id];
      if (!batch || batch.buffer.getCount === 0) continue;
      batch.buffer.upload();
      encoder.setVertexBuffer(0, batch.buffer.getBuffer);
      encoder.setPipeline(this.pipelines[id].opaque!);
      encoder.draw(6, batch.buffer.getCount);
    }

    if (this.vertexBuffer.getCount === 0) return;
    const buffer = sorting ? this.sortInstances() : this.vertexBuffer;
    buffer.upload();
    encoder.setVertexBuffer(0, buffer.getBuffer);
    const uints = buffer.getUints;
    const stride = WORLD_LAYOUT.stride;
    const offset = WORLD_LAYOUT.offsets.materialClip;
    const count = buffer.getCount;
    let first = 0;
    while (first < count) {
      // the clip id in the high bits does not split a run, only the material does
      const id = materialOf(uints[first * stride + offset]);
      let end = first + 1;
      while (end < count && materialOf(uints[end * stride + offset]) === id)
        end++;
      const pipelines =
        this.pipelines[id] ?? this.pipelines[DEFAULT_MATERIAL.id];
      encoder.setPipeline(pipelines.transparent);
      encoder.draw(6, end - first, 0, first);
      first = end;
    }
  }
  private async createPipelines(
    targets: PassTargets,
    material: Material,
    sorting: boolean,
  ): Promise<MaterialPipelines> {
    const shader = DrawWorldShader.replace("// MATERIAL", material.fragment);
    const constants = { linearColors: Aurora.isLinear, depthSort: sorting };
    const [opaque, transparent] = await Promise.all([
      this.opaqueBatches[material.id]
        ? Aurora.createRenderPipeline(targets, {
            label: `WorldPass:${material.name}:opaque`,
            shader,
            buffers: [WORLD_LAYOUT.layout],
            binds: this.binds.layout,
            blend: material.gpuBlend,
            constants: { ...constants, opaquePass: true },
            depth: { compare: "less-equal", write: true },
          })
        : null,
      Aurora.createRenderPipeline(targets, {
        label: `WorldPass:${material.name}`,
        shader,
        buffers: [WORLD_LAYOUT.layout],
        binds: this.binds.layout,
        blend: material.gpuBlend,
        constants: { ...constants, opaquePass: false },
        depth: { compare: "less-equal", write: false },
      }),
    ]);
    return { opaque, transparent };
  }
  private sortAxes(sortMode: SortProps["sortMode"]) {
    switch (sortMode) {
      case "none":
        return [];
      case "y":
        return [1];
      case "y+x":
        return [1, 0];
      case "y+x+z":
        return [1, 0, 2];
      case "layer":
        return [2];
    }
  }
  private updateSorter() {
    const { frameMinX, frameMaxX, frameMinY, frameMaxY, sortAxes } =
      this.sorter;
    const { origin, step, count, weight } = this.sortParams;
    const empty = frameMinX > frameMaxX;

    origin[0] = empty ? 0 : frameMinX;
    origin[1] = empty ? 0 : frameMinY;
    count[0] = empty ? 1 : Math.floor((frameMaxX - frameMinX) / step[0]) + 1;
    count[1] = empty ? 1 : Math.floor((frameMaxY - frameMinY) / step[1]) + 1;

    weight.fill(0);
    let total = 1;
    for (let i = sortAxes.length - 1; i >= 0; i--) {
      const axis = sortAxes[i];
      weight[axis] = total;
      total *= count[axis];
    }
    this.sortUniform.floats[3] = total;
    this.sortUniform.upload();
  }
  private sortKey(floats: Float32Array, point: number) {
    const { origin, step, count, weight } = this.sortParams;
    const axes = this.sorter.sortAxes;
    let key = 0;
    for (let i = 0; i < axes.length; i++) {
      const axis = axes[i];
      const cell = Math.floor(
        (floats[point + axis] - origin[axis]) / step[axis],
      );
      // clamp: z outside zRange must not spill into the next axis
      key += AxiomMath.clamp(cell, 0, count[axis] - 1) * weight[axis];
    }
    return key;
  }
  private sortInstances() {
    const count = this.vertexBuffer.getCount;
    if (this.keys.length < count) {
      this.keys = new Float64Array(2 ** Math.ceil(Math.log2(count)));
    }
    const floats = this.vertexBuffer.getFloats;
    const stride = WORLD_LAYOUT.stride;
    const sortPoint = WORLD_LAYOUT.offsets.sortPoint;
    // key * count + index stays an exact integer in float64, so the native sort
    // orders by key and keeps call order on ties, no comparator needed
    const keys = this.keys.subarray(0, count);
    for (let i = 0; i < count; i++) {
      keys[i] = this.sortKey(floats, i * stride + sortPoint) * count + i;
    }
    keys.sort();

    this.sorted.reserve(count);
    const source = this.vertexBuffer.getUints;
    const target = this.sorted.getUints;
    for (let i = 0; i < count; i++) {
      const from = (keys[i] % count) * stride;
      const to = i * stride;
      for (let word = 0; word < stride; word++)
        target[to + word] = source[from + word];
    }
    return this.sorted;
  }
}
