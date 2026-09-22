import Aurora from "../core";

export interface FixedBufferOptions {
  label: string;
  words: number;
  usage: GPUBufferUsageFlags;
}

const WORD = 4;

export default class FixedBuffer {
  public readonly floats: Float32Array;
  public readonly uints: Uint32Array;
  private readonly buffer: GPUBuffer;

  constructor({ label, words, usage }: FixedBufferOptions) {
    const data = new ArrayBuffer(words * WORD);
    this.floats = new Float32Array(data);
    this.uints = new Uint32Array(data);
    this.buffer = Aurora.device.createBuffer({
      label,
      size: data.byteLength,
      usage: usage | GPUBufferUsage.COPY_DST,
    });
  }

  public get getBuffer() {
    return this.buffer;
  }

  public upload() {
    Aurora.device.queue.writeBuffer(this.buffer, 0, this.floats);
  }

  public destroy() {
    this.buffer.destroy();
  }
}
