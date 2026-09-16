import Aurora from "./core";

const BYTES_PER_QUERY = BigUint64Array.BYTES_PER_ELEMENT;

export interface PassTime {
  name: string;
  time: number;
}

export default class GpuTimer {
  declare private static querySet: GPUQuerySet;
  declare private static resolveBuffer: GPUBuffer;
  declare private static readBuffer: GPUBuffer;
  declare private static writesBegin: GPURenderPassTimestampWrites;
  declare private static writesEnd: GPURenderPassTimestampWrites;
  private static capacity = 0;
  private static perPass = false;
  private static slotCount = 0;
  private static lastSlotCount = 0;
  private static frameStarted = false;
  private static frameNames: string[] = [];
  private static frameStepped: boolean[] = [];
  private static pendingNames: string[] = [];
  private static pendingStepped: boolean[] = [];
  private static pendingCount = 0;
  private static pendingPerPass = false;
  private static copied = false;
  private static time: number | null = null;
  private static passTimes: PassTime[] = [];

  public static init() {
    this.allocate(2);
  }

  public static setPerPass(enabled: boolean) {
    this.perPass = enabled;
    if (!enabled) this.passTimes.forEach((pass) => (pass.time = 0));
  }

  public static beginFrame() {
    const needed = this.lastSlotCount * 2;
    if (
      this.perPass &&
      needed > this.capacity &&
      this.readBuffer.mapState === "unmapped"
    ) {
      this.allocate(needed);
    }
    this.slotCount = 0;
    this.frameStarted = false;
    this.frameNames.length = 0;
    this.frameStepped.length = 0;
    this.copied = false;
  }

  public static beginPass(name: string) {
    this.slotCount++;
    if (!this.perPass) return;
    this.frameNames.push(name);
    this.frameStepped.push(false);
  }

  public static stepWrites(): GPURenderPassTimestampWrites | undefined {
    if (!this.perPass) {
      if (this.frameStarted) return this.writesEnd;
      this.frameStarted = true;
      return this.writesBegin;
    }

    const slot = this.slotCount - 1;
    const begin = slot * 2;
    if (slot < 0 || begin + 1 >= this.capacity) return undefined;
    if (this.frameStepped[slot]) {
      return { querySet: this.querySet, endOfPassWriteIndex: begin + 1 };
    }
    this.frameStepped[slot] = true;
    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex: begin,
      endOfPassWriteIndex: begin + 1,
    };
  }

  public static resolve(encoder: GPUCommandEncoder) {
    this.lastSlotCount = this.slotCount;
    const count = this.perPass ? this.slotCount * 2 : 2;
    const anyStep = this.perPass
      ? this.frameStepped.includes(true)
      : this.frameStarted;
    if (!anyStep || count > this.capacity) return;
    if (this.readBuffer.mapState !== "unmapped") return;

    encoder.resolveQuerySet(this.querySet, 0, count, this.resolveBuffer, 0);
    encoder.copyBufferToBuffer(
      this.resolveBuffer,
      0,
      this.readBuffer,
      0,
      count * BYTES_PER_QUERY,
    );
    this.pendingCount = count;
    this.pendingPerPass = this.perPass;
    if (this.perPass) {
      this.pendingNames = this.frameNames.slice();
      this.pendingStepped = this.frameStepped.slice();
    }
    this.copied = true;
  }

  public static read() {
    if (!this.copied) return;
    this.readBuffer.mapAsync(GPUMapMode.READ).then(() => {
      const times = new BigUint64Array(
        this.readBuffer.getMappedRange(0, this.pendingCount * BYTES_PER_QUERY),
      );

      if (!this.pendingPerPass) {
        this.time = this.diff(times[0], times[1]);
      } else {
        const first = this.pendingStepped.indexOf(true);
        const last = this.pendingStepped.lastIndexOf(true);
        this.time = this.diff(times[first * 2], times[last * 2 + 1]);
        if (this.perPass) {
          this.passTimes = this.pendingNames.map((name, i) => ({
            name,
            time: this.pendingStepped[i]
              ? this.diff(times[i * 2], times[i * 2 + 1])
              : 0,
          }));
        }
      }
      this.readBuffer.unmap();
    });
  }

  public static get getTime() {
    return this.time;
  }

  public static get getPassTimes() {
    return this.passTimes;
  }

  private static diff(start: bigint, end: bigint) {
    return end > start ? Number(end - start) / 1_000_000 : 0;
  }

  private static allocate(capacity: number) {
    this.querySet?.destroy();
    this.resolveBuffer?.destroy();
    this.readBuffer?.destroy();

    this.capacity = capacity;
    this.querySet = Aurora.device.createQuerySet({
      label: "gpuTimerQuery",
      type: "timestamp",
      count: capacity,
    });
    this.resolveBuffer = Aurora.device.createBuffer({
      label: "gpuTimerResolve",
      size: capacity * BYTES_PER_QUERY,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    this.readBuffer = Aurora.device.createBuffer({
      label: "gpuTimerRead",
      size: capacity * BYTES_PER_QUERY,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    this.writesBegin = {
      querySet: this.querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    };
    this.writesEnd = { querySet: this.querySet, endOfPassWriteIndex: 1 };
  }
}
