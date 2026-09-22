import { assert } from "@axiom/utils";
import GrowingBuffer from "@aurora/utils/growingBuffer";
import { AuroraUsage } from "@aurora/utils/usage";
import { CLIP, ClipShape } from "./clip";

// clips of one pass for one frame, instances point at them by id; id 0 is no clip
export default class ClipBuffer {
  private readonly buffer: GrowingBuffer;
  private readonly label: string;

  constructor(label: string) {
    this.label = label;
    this.buffer = new GrowingBuffer({
      label,
      stride: CLIP.words,
      usage: AuroraUsage.buffer.STORAGE,
    });
    this.reset();
  }

  public get getBuffer() {
    return this.buffer.getBuffer;
  }
  // without the empty entry 0
  public get getCount() {
    return this.buffer.getCount - 1;
  }

  public push(shape: ClipShape, parent: number) {
    const id = this.buffer.push();
    assert(
      id < 2 ** CLIP.idBits,
      `${this.label}: more than ${2 ** CLIP.idBits - 1} clips in one frame`,
    );
    const base = id * CLIP.words;
    const floats = this.buffer.getFloats;
    floats[base] = shape.x;
    floats[base + 1] = shape.y;
    floats[base + 2] = shape.width / 2;
    floats[base + 3] = shape.height / 2;
    floats.set(shape.radius, base + 4);
    floats[base + 8] = Math.cos(shape.rotation);
    floats[base + 9] = Math.sin(shape.rotation);
    this.buffer.getUints[base + 10] = parent;
    return id;
  }

  public reset() {
    this.buffer.clear();
    const base = this.buffer.push() * CLIP.words;
    this.buffer.getFloats.fill(0, base, base + CLIP.words);
  }

  public upload() {
    this.buffer.upload();
  }

  public destroy() {
    this.buffer.destroy();
  }
}
