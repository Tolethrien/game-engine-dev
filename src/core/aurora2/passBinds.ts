import { assert } from "@axiom/utils";
import Aurora from "./core";
import { ALL_STAGES } from "./sharedBinds";

type PassBindEntry = {
  binding: number;
  visibility?: GPUShaderStageFlags;
} & (
  | {
      type: "texture";
      sampleType?: GPUTextureSampleType;
      dimension?: GPUTextureViewDimension;
    }
  | {
      type: "storageTexture";
      format: GPUTextureFormat;
      access?: GPUStorageTextureAccess;
      dimension?: GPUTextureViewDimension;
    }
  | { type: "uniform" }
  | { type: "storage"; readOnly?: boolean }
  | { type: "sampler"; samplerType?: GPUSamplerBindingType }
);
export type PassBindEntries = Record<string, PassBindEntry>;
type BindResource<E extends PassBindEntry> = E["type"] extends
  "texture" | "storageTexture"
  ? GPUTextureView
  : E["type"] extends "sampler"
    ? GPUSampler
    : GPUBuffer;
type PassBindResources<T extends PassBindEntries> = {
  [K in keyof T]: BindResource<T[K]>;
};
type BindResourceValue = GPUTextureView | GPUBuffer | GPUSampler;
interface CachedBindGroup {
  resources: BindResourceValue[];
  bindGroup: GPUBindGroup;
}
const CACHE_SIZE = 4;
const NO_VERTEX = GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;

export default class PassBinds<T extends PassBindEntries> {
  public readonly layout: GPUBindGroupLayout;
  private readonly label: string;
  private readonly entries: T;
  private readonly names: (keyof T)[];
  private cache: CachedBindGroup[] = [];

  constructor(label: string, entries: T) {
    this.label = label;
    this.entries = entries;
    this.names = Object.keys(entries) as (keyof T)[];

    const bindings: Set<number> = new Set();
    const layoutEntries: GPUBindGroupLayoutEntry[] = [];
    for (const name of this.names) {
      const entry = entries[name];
      assert(
        !bindings.has(entry.binding),
        `${label}: binding ${entry.binding} is used more than once`,
      );
      bindings.add(entry.binding);
      layoutEntries.push(this.layoutEntry(entry));
    }
    this.layout = Aurora.device.createBindGroupLayout({
      label: `${label}Layout`,
      entries: layoutEntries,
    });
  }

  public get(resources: PassBindResources<T>) {
    for (const cached of this.cache) {
      let same = true;
      for (let i = 0; i < this.names.length; i++) {
        if (cached.resources[i] !== resources[this.names[i]]) {
          same = false;
          break;
        }
      }
      if (same) return cached.bindGroup;
    }

    const values: BindResourceValue[] = [];
    const entries: GPUBindGroupEntry[] = [];
    for (let i = 0; i < this.names.length; i++) {
      const resource = resources[this.names[i]];
      values.push(resource);
      entries.push({
        binding: this.entries[this.names[i]].binding,
        resource:
          resource instanceof GPUBuffer ? { buffer: resource } : resource,
      });
    }
    const bindGroup = Aurora.device.createBindGroup({
      label: `${this.label}Bind`,
      layout: this.layout,
      entries,
    });

    this.cache.push({ resources: values, bindGroup });
    if (this.cache.length > CACHE_SIZE) this.cache.shift();
    return bindGroup;
  }

  private layoutEntry(entry: PassBindEntry): GPUBindGroupLayoutEntry {
    const binding = entry.binding;
    switch (entry.type) {
      case "texture":
        return {
          binding,
          visibility: entry.visibility ?? ALL_STAGES,
          texture: {
            sampleType: entry.sampleType ?? "float",
            viewDimension: entry.dimension ?? "2d",
          },
        };
      case "storageTexture":
        return {
          binding,
          visibility: entry.visibility ?? NO_VERTEX,
          storageTexture: {
            format: entry.format,
            access: entry.access ?? "write-only",
            viewDimension: entry.dimension ?? "2d",
          },
        };
      case "uniform":
        return {
          binding,
          visibility: entry.visibility ?? ALL_STAGES,
          buffer: { type: "uniform" },
        };
      case "storage":
        return {
          binding,
          visibility:
            entry.visibility ?? (entry.readOnly ? ALL_STAGES : NO_VERTEX),
          buffer: { type: entry.readOnly ? "read-only-storage" : "storage" },
        };
      case "sampler":
        return {
          binding,
          visibility: entry.visibility ?? ALL_STAGES,
          sampler: { type: entry.samplerType ?? "filtering" },
        };
    }
  }
}
