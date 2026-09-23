import Aurora from "./core";

const BYTES_PER_QUERY = BigUint64Array.BYTES_PER_ELEMENT;
const TIMER_CONFIG = {
  readbackSlots: 3,
  // same window as the profiler's stats (AURORA_HISTORY.statsReports), so both show the same median
  windowMs: 5000,
  windowCapacity: 4096,
};

export interface GpuSteps {
  frame: number;
  count: number;
  owners: string[];
  labels: string[];
  times: number[];
  starts: number[];
  span: number;
  busy: number;
}

interface Readback {
  buffer: GPUBuffer;
  count: number;
  owners: string[];
  labels: string[];
  frame: number;
}

class MedianWindow {
  private readonly values = new Float64Array(TIMER_CONFIG.windowCapacity);
  private readonly stamps = new Float64Array(TIMER_CONFIG.windowCapacity);
  private readonly scratch = new Float64Array(TIMER_CONFIG.windowCapacity);
  private head = 0;
  private count = 0;
  private cached: number | null = null;
  private dirty = false;

  public push(value: number, now: number) {
    while (
      this.count > 0 &&
      now - this.oldestStamp() > TIMER_CONFIG.windowMs
    ) {
      this.dropOldest();
    }
    if (this.count === TIMER_CONFIG.windowCapacity) this.dropOldest();

    this.values[this.head] = value;
    this.stamps[this.head] = now;
    this.head = (this.head + 1) % TIMER_CONFIG.windowCapacity;
    this.count++;
    this.dirty = true;
  }

  public get median() {
    if (!this.dirty) return this.cached;
    this.dirty = false;
    if (this.count === 0) return (this.cached = null);

    const start = this.oldestIndex();
    for (let i = 0; i < this.count; i++) {
      this.scratch[i] = this.values[(start + i) % TIMER_CONFIG.windowCapacity];
    }
    const sorted = this.scratch.subarray(0, this.count).sort();
    const middle = this.count >> 1;
    return (this.cached =
      this.count % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
  }

  private oldestIndex() {
    return (
      (this.head - this.count + TIMER_CONFIG.windowCapacity) %
      TIMER_CONFIG.windowCapacity
    );
  }
  private oldestStamp() {
    return this.stamps[this.oldestIndex()];
  }
  private dropOldest() {
    this.count--;
  }
}

export default class GpuTimer {
  declare private static querySet: GPUQuerySet;
  declare private static resolveBuffer: GPUBuffer;
  private static readbacks: Readback[] = [];
  private static capacity = 0;
  private static slotCount = 0;
  private static lastSlotCount = 0;
  private static owner = "";
  private static frameOwners: string[] = [];
  private static frameLabels: string[] = [];
  private static frameIndex = 0;
  private static readFrame = -1;
  private static pending: Readback | null = null;
  private static window = new MedianWindow();
  private static steps: GpuSteps = {
    frame: -1,
    count: 0,
    owners: [],
    labels: [],
    times: [],
    starts: [],
    span: 0,
    busy: 0,
  };

  public static init() {
    this.allocate(2);
  }

  public static beginFrame() {
    const needed = this.lastSlotCount * 2;
    if (needed > this.capacity && this.slotsIdle()) this.allocate(needed);
    this.frameIndex++;
    this.slotCount = 0;
    this.frameOwners.length = 0;
    this.frameLabels.length = 0;
    this.pending = null;
  }

  public static beginPass(owner: string) {
    this.owner = owner;
  }

  public static stepWrites(label: string): GPURenderPassTimestampWrites | undefined {
    const slot = this.slotCount++;
    this.frameOwners.push(this.owner);
    this.frameLabels.push(label);

    const begin = slot * 2;
    if (begin + 1 >= this.capacity) return undefined;
    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex: begin,
      endOfPassWriteIndex: begin + 1,
    };
  }

  public static resolve(encoder: GPUCommandEncoder) {
    this.lastSlotCount = this.slotCount;
    const count = this.slotCount * 2;
    if (this.slotCount === 0 || count > this.capacity) return;

    const slot = this.readbacks.find(
      (readback) => readback.buffer.mapState === "unmapped",
    );
    if (slot === undefined) return;

    encoder.resolveQuerySet(this.querySet, 0, count, this.resolveBuffer, 0);
    encoder.copyBufferToBuffer(
      this.resolveBuffer,
      0,
      slot.buffer,
      0,
      count * BYTES_PER_QUERY,
    );
    slot.count = count;
    slot.frame = this.frameIndex;
    slot.owners.length = 0;
    slot.labels.length = 0;
    for (let i = 0; i < this.frameOwners.length; i++) {
      slot.owners.push(this.frameOwners[i]);
      slot.labels.push(this.frameLabels[i]);
    }
    this.pending = slot;
  }

  public static read() {
    const slot = this.pending;
    if (slot === null) return;
    this.pending = null;
    slot.buffer
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const times = new BigUint64Array(
          slot.buffer.getMappedRange(0, slot.count * BYTES_PER_QUERY),
        );
        if (slot.frame > this.readFrame) {
          this.readFrame = slot.frame;
          this.apply(slot, times);
        }
        slot.buffer.unmap();
      })
      .catch(() => undefined);
  }

  public static get getTime() {
    return this.window.median;
  }

  public static get getSteps(): Readonly<GpuSteps> {
    return this.steps;
  }

  private static apply(slot: Readback, times: BigUint64Array) {
    const count = slot.owners.length;
    this.steps.owners.length = 0;
    this.steps.labels.length = 0;
    this.steps.times.length = 0;
    this.steps.starts.length = 0;

    let frameBegin = 0n;
    let frameEnd = 0n;
    let found = false;
    for (let i = 0; i < count; i++) {
      const begin = times[i * 2];
      const end = times[i * 2 + 1];
      if (end <= begin) continue;
      if (!found || begin < frameBegin) frameBegin = begin;
      if (!found || end > frameEnd) frameEnd = end;
      found = true;
    }

    let busy = 0;
    for (let i = 0; i < count; i++) {
      const begin = times[i * 2];
      const end = times[i * 2 + 1];
      const time = this.diff(begin, end);
      busy += time;
      this.steps.owners.push(slot.owners[i]);
      this.steps.labels.push(slot.labels[i]);
      this.steps.times.push(time);
      this.steps.starts.push(
        end > begin ? Number(begin - frameBegin) / 1_000_000 : 0,
      );
    }
    const span = found ? Number(frameEnd - frameBegin) / 1_000_000 : 0;
    this.steps.frame = slot.frame;
    this.steps.count = count;
    this.steps.span = span;
    this.steps.busy = busy;
    this.window.push(span, performance.now());
  }

  private static diff(start: bigint, end: bigint) {
    return end > start ? Number(end - start) / 1_000_000 : 0;
  }

  private static slotsIdle() {
    return this.readbacks.every(
      (readback) => readback.buffer.mapState === "unmapped",
    );
  }

  private static allocate(capacity: number) {
    this.querySet?.destroy();
    this.resolveBuffer?.destroy();
    this.readbacks.forEach((readback) => readback.buffer.destroy());

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
    this.readbacks = Array.from({ length: TIMER_CONFIG.readbackSlots }, (_, index) => ({
      buffer: Aurora.device.createBuffer({
        label: `gpuTimerRead${index}`,
        size: capacity * BYTES_PER_QUERY,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      }),
      count: 0,
      owners: [],
      labels: [],
      frame: -1,
    }));
    this.pending = null;
  }
}
