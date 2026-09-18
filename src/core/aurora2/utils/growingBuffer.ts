import Aurora from "../core";

export interface GrowingBufferOptions {
  label: string;
  stride: number;
  usage: GPUBufferUsageFlags;
  capacity?: number;
}

const DEFAULT_CAPACITY = 64;
const WORD = 4;
const SHRINK_RATIO = 4;
const SHRINK_FRAMES = 300;

export default class GrowingBuffer {
  private floats!: Float32Array;
  private uints!: Uint32Array;
  private bytes!: Uint8Array;
  private buffer: GPUBuffer;
  private readonly label: string;
  private readonly stride: number;
  private readonly usage: GPUBufferUsageFlags;
  private readonly minCapacity: number;
  private capacity: number;
  private gpuCapacity: number;
  private count = 0;
  private lowFrames = 0;
  private peak = 0;

  constructor({
    label,
    stride,
    usage,
    capacity = DEFAULT_CAPACITY,
  }: GrowingBufferOptions) {
    this.label = label;
    this.stride = stride;
    this.usage = usage | GPUBufferUsage.COPY_DST;
    this.minCapacity = Math.max(1, capacity);
    this.capacity = this.minCapacity;
    this.reallocate();
    this.gpuCapacity = this.capacity;
    this.buffer = this.createGPUBuffer();
  }

  public get getBuffer() {
    return this.buffer;
  }
  public get getCount() {
    return this.count;
  }
  public get getFloats() {
    return this.floats;
  }
  public get getUints() {
    return this.uints;
  }
  public get getBytes() {
    return this.bytes;
  }
  public get getStride() {
    return this.stride;
  }

  public reserve(count: number) {
    this.count = count;
    if (count > this.capacity) {
      this.capacity = 2 ** Math.ceil(Math.log2(count));
      this.reallocate();
    }
  }

  public push() {
    if (this.count === this.capacity) this.resize(this.capacity * 2);
    return this.count++;
  }

  public clear() {
    this.fitCapacity();
    this.count = 0;
  }

  public upload() {
    if (this.gpuCapacity !== this.capacity) {
      this.buffer.destroy();
      this.gpuCapacity = this.capacity;
      this.buffer = this.createGPUBuffer();
    }
    if (this.count === 0) return;
    Aurora.device.queue.writeBuffer(
      this.buffer,
      0,
      this.floats.buffer,
      0,
      this.count * this.stride * WORD,
    );
  }

  public destroy() {
    this.buffer.destroy();
  }

  // grows/shrinks toward how full the buffer actually was, drops old contents
  private fitCapacity() {
    const count = this.count;
    let target = this.capacity;

    if (count * SHRINK_RATIO > this.capacity) {
      this.lowFrames = 0;
      this.peak = 0;
    } else {
      this.peak = Math.max(this.peak, count);
      this.lowFrames++;
      if (this.lowFrames >= SHRINK_FRAMES) {
        target = Math.max(
          this.minCapacity,
          2 ** Math.ceil(Math.log2(Math.max(1, this.peak))),
        );
        this.lowFrames = 0;
        this.peak = 0;
      }
    }

    if (target === this.capacity) return;
    this.capacity = target;
    this.reallocate();
  }

  private reallocate() {
    const data = new ArrayBuffer(this.capacity * this.stride * WORD);
    this.floats = new Float32Array(data);
    this.uints = new Uint32Array(data);
    this.bytes = new Uint8Array(data);
  }

  // grows in place, keeping existing instances (push must not drop live data)
  private resize(capacity: number) {
    const old = this.bytes;
    this.capacity = capacity;
    this.reallocate();
    this.bytes.set(old);
  }

  private createGPUBuffer() {
    return Aurora.device.createBuffer({
      label: this.label,
      size: this.gpuCapacity * this.stride * WORD,
      usage: this.usage,
    });
  }
}
