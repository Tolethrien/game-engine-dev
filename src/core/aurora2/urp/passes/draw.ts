import { assert } from "@axiom/utils";
import AxiomMath from "@axiom/math";
import Aurora, { RenderPipelineOptions } from "../../core";
import { PassResources, PassTargets, RenderPass } from "../../pass";
import PassBinds, { PassBindEntries } from "../../passBinds";
import GrowingBuffer from "../../utils/growingBuffer";
import VertexLayout, {
  VertexFields,
  VertexWriter,
} from "../../utils/vertexLayout";
import { DEFAULT_MATERIAL, DrawApi } from "../draw";
import Material from "../../material";
import shader from "../shaders/draw.wgsl?raw";
import type { URPSortConfig } from "../urp";

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
  // cpu only, splits transparents into batches, not read by the shader
  material: "uint32",
} satisfies VertexFields;
const INSTANCE = new VertexLayout(INSTANCE_FIELDS, { stepMode: "instance" });
const BINDS = {
  sort: { binding: 0, type: "uniform" },
} satisfies PassBindEntries;
export type DrawWriter = VertexWriter<typeof INSTANCE_FIELDS>;

interface MaterialPipelines {
  opaque: GPURenderPipeline | null;
  transparent: GPURenderPipeline;
}
interface OpaqueBatch {
  buffer: GrowingBuffer;
  writer: DrawWriter;
}
export interface DrawPassOptions {
  name: string;
  space: "world" | "screen";
  target: string;
  sort: URPSortConfig;
  api: DrawApi;
}

export default class DrawPass extends RenderPass {
  private static readonly MATERIAL_MARKER = "// MATERIAL";
  public readonly name: string;
  public readonly sort: URPSortConfig;
  private readonly space: DrawPassOptions["space"];
  private readonly target: string;
  private readonly facade: DrawApi;
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

  constructor({ name, space, target, sort, api }: DrawPassOptions) {
    super();
    this.name = name;
    this.space = space;
    this.target = target;
    this.facade = api;
    this.sort = sort;
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

  async setup(targets: PassTargets) {
    assert(
      shader.includes(DrawPass.MATERIAL_MARKER),
      `draw.wgsl is missing the "${DrawPass.MATERIAL_MARKER}" marker`,
    );
    this.transparent = this.createBuffer(`${this.name}Transparent`);
    this.sorted = this.createBuffer(`${this.name}Sorted`);
    this.transparentWriter = INSTANCE.createWriter(this.transparent);
    this.binds = new PassBinds(this.name, BINDS);
    this.sortBuffer = Aurora.device.createBuffer({
      label: `${this.name}Sort`,
      size: this.sortData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const materials = Material.getAll;
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
    this.pipelines = await Promise.all(
      materials.map((material) => this.createPipelines(targets, material)),
    );

    this.facade.setTarget(this);
  }

  resources(res: PassResources) {
    res.readAsset("albedo");
    res.readAsset("ui");
    res.readAsset("fonts");
    if (this.space === "screen") {
      res.sampler("linearClamp");
      res.create(
        this.target,
        { size: { scale: 1, base: "canvas" }, format: "rgba16float" },
        { clearValue: [0, 0, 0, 0] },
      );
    } else {
      const color = Aurora.getSettings.rendering.canvasColor;
      const alpha = color[3] / 255;
      res.sampler("nearestClamp");
      res.create(
        this.target,
        { size: { scale: 1 }, format: "rgba16float" },
        {
          clearValue: [
            Aurora.colorChannel(color[0]) * alpha,
            Aurora.colorChannel(color[1]) * alpha,
            Aurora.colorChannel(color[2]) * alpha,
            alpha,
          ],
        },
      );
    }
    if (this.depthSorted) {
      res.create(
        `${this.name}Depth`,
        {
          size:
            this.space === "screen"
              ? { scale: 1, base: "canvas" }
              : { scale: 1 },
          format: "depth32float",
        },
        { depthClearValue: 1 },
      );
    }
  }

  public instance(
    opaque: boolean,
    material: Material,
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
    writer.material(id);
    writer.sortPoint(sortX, sortY, sortZ);
    return writer;
  }

  public beginFrame() {
    for (const batch of this.opaqueBatches) batch?.buffer.clear();
    this.transparent.clear();
    // sortTransparent (and its reserve) only runs on frames with transparents,
    // so a quiet-frame count on its own would never shrink this one back down
    this.sorted.clear();
    const range = this.objectSortingRange;
    range.minX = Infinity;
    range.maxX = -Infinity;
    range.minY = Infinity;
    range.maxY = -Infinity;
  }

  execute(encoder: GPURenderPassEncoder) {
    this.updateSort();
    encoder.setBindGroup(2, this.binds.get({ sort: this.sortBuffer }));

    // opaque: one draw per material, depth decides the order
    for (let id = 0; id < this.opaqueBatches.length; id++) {
      const pipeline = this.pipelines[id].opaque;
      const batch = this.opaqueBatches[id];
      if (!pipeline || !batch || batch.buffer.getCount === 0) continue;
      batch.buffer.upload();
      encoder.setPipeline(pipeline);
      encoder.setVertexBuffer(0, batch.buffer.getBuffer);
      encoder.draw(6, batch.buffer.getCount);
    }

    const count = this.transparent.getCount;
    if (count === 0) return;
    const buffer = this.depthSorted ? this.sortTransparent() : this.transparent;
    buffer.upload();
    encoder.setVertexBuffer(0, buffer.getBuffer);

    // transparent: keep the order, one draw per run of the same material
    const uints = buffer.getUints;
    const stride = INSTANCE.stride;
    const material = INSTANCE.offsets.material;
    let first = 0;
    while (first < count) {
      const id = uints[first * stride + material];
      let end = first + 1;
      while (end < count && uints[end * stride + material] === id) end++;
      encoder.setPipeline(this.pipelines[id].transparent);
      encoder.draw(6, end - first, 0, first);
      first = end;
    }
  }

  destroy() {
    this.facade.clearTarget(this);
    for (const batch of this.opaqueBatches) batch?.buffer.destroy();
    this.transparent.destroy();
    this.sorted.destroy();
    this.sortBuffer.destroy();
  }

  private async createPipelines(
    targets: PassTargets,
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
    if (this.depthSorted) {
      // depth32float keeps whole numbers exact up to 2^24, above 100 neighbours can share depth
      const used = (this.sortParams.total / 2 ** 24) * 100;
      counters["sort depth used %"] = Math.round(used * 10) / 10;
    }
    return counters;
  }
}
