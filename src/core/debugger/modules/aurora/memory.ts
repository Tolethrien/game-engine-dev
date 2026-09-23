const FORMAT_BYTES: Record<string, number> = {
  r8unorm: 1,
  rg8unorm: 2,
  r16float: 2,
  depth16unorm: 2,
  rgba8unorm: 4,
  "rgba8unorm-srgb": 4,
  bgra8unorm: 4,
  "bgra8unorm-srgb": 4,
  rg16float: 4,
  r32float: 4,
  depth24plus: 4,
  "depth24plus-stencil8": 4,
  depth32float: 4,
  rgba16float: 8,
  rgba32float: 16,
};

const UNKNOWN_FORMAT_BYTES = 4;
const warnedFormats: Set<string> = new Set();

type EntryKind = AuroraMemoryRow["kind"];

interface Entry {
  kind: EntryKind;
  group: string;
  label: string;
  bytes: number;
}

export interface MemorySummary {
  rows: AuroraMemoryRow[];
  totals: Record<EntryKind, number> & { all: number };
}

export function textureBytes(
  format: GPUTextureFormat,
  width: number,
  height: number,
  layers: number,
  mips: number,
) {
  let bytesPerTexel = FORMAT_BYTES[format];
  if (bytesPerTexel === undefined) {
    bytesPerTexel = UNKNOWN_FORMAT_BYTES;
    if (!warnedFormats.has(format)) {
      warnedFormats.add(format);
      console.warn(
        `[Aurora] memory tracker: unknown format "${format}", assuming ${UNKNOWN_FORMAT_BYTES} B/texel`,
      );
    }
  }

  let texels = 0;
  for (let mip = 0; mip < mips; mip++) {
    texels += Math.max(1, width >> mip) * Math.max(1, height >> mip) * layers;
  }
  return texels * bytesPerTexel;
}

const TEXTURE_GROUPS = [
  ["render|", "pool render"],
  ["canvas|", "pool canvas"],
  ["fixed|", "pool fixed"],
] as const;

export class MemoryTracker {
  private entries: Map<number, Entry> = new Map();
  private ids: WeakMap<object, number> = new WeakMap();
  private registry = new FinalizationRegistry<number>((id) =>
    this.entries.delete(id),
  );
  private nextId = 0;

  public watch(device: GPUDevice) {
    const createTexture = device.createTexture.bind(device);
    device.createTexture = (descriptor) => {
      const texture = createTexture(descriptor);
      const label = descriptor.label ?? "";
      this.track(texture, {
        kind: "texture",
        group: this.textureGroup(label),
        label,
        bytes: this.descriptorBytes(descriptor),
      });
      return texture;
    };

    const createBuffer = device.createBuffer.bind(device);
    device.createBuffer = (descriptor) => {
      const buffer = createBuffer(descriptor);
      this.track(buffer, {
        kind: "buffer",
        group: this.bufferGroup(descriptor.usage),
        label: descriptor.label ?? "",
        bytes: descriptor.size,
      });
      return buffer;
    };
  }

  public bytesOf(object: object) {
    const id = this.ids.get(object);
    return id === undefined ? 0 : (this.entries.get(id)?.bytes ?? 0);
  }

  public summary(): MemorySummary {
    const groups = new Map<string, AuroraMemoryRow>();
    const totals = { texture: 0, buffer: 0, all: 0 };
    for (const { kind, group, bytes } of this.entries.values()) {
      const key = `${group}|${kind}`;
      let row = groups.get(key);
      if (!row) groups.set(key, (row = { group, kind, count: 0, bytes: 0 }));
      row.count++;
      row.bytes += bytes;
      totals[kind] += bytes;
      totals.all += bytes;
    }
    return { rows: [...groups.values()], totals };
  }

  private track(object: { destroy(): undefined }, entry: Entry) {
    const id = this.nextId++;
    this.entries.set(id, entry);
    this.ids.set(object, id);
    this.registry.register(object, id);

    const destroy = object.destroy.bind(object);
    object.destroy = () => {
      this.entries.delete(id);
      destroy();
    };
  }

  private descriptorBytes(descriptor: GPUTextureDescriptor) {
    const size = descriptor.size;
    if (Array.isArray(size)) {
      const [width, height = 1, layers = 1] = size;
      return textureBytes(descriptor.format, width, height, layers, descriptor.mipLevelCount ?? 1);
    }
    const extent = size as GPUExtent3DDict;
    return textureBytes(
      descriptor.format,
      extent.width,
      extent.height ?? 1,
      extent.depthOrArrayLayers ?? 1,
      descriptor.mipLevelCount ?? 1,
    );
  }

  private textureGroup(label: string) {
    for (const [prefix, group] of TEXTURE_GROUPS) {
      if (label.startsWith(prefix)) return group;
    }
    if (label === "fontsArray") return "fonts";
    if (label.endsWith("Array")) return "assets";
    return "other textures";
  }

  private bufferGroup(usage: GPUBufferUsageFlags) {
    if (usage & (GPUBufferUsage.MAP_READ | GPUBufferUsage.QUERY_RESOLVE))
      return "timer";
    if (usage & GPUBufferUsage.VERTEX) return "vertex";
    if (usage & GPUBufferUsage.INDEX) return "index";
    if (usage & GPUBufferUsage.UNIFORM) return "uniform";
    if (usage & GPUBufferUsage.STORAGE) return "storage";
    return "other buffers";
  }
}
