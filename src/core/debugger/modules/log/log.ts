import type { ILogHandle, ILogger } from "../../interfaces";
import type { LogLevel, LogMessage, LogSuppressed } from "./report";
import { serialize } from "./serialize";
import { LOG_MIRROR_TAG } from "./format";
import { LOG_SCOPE, type LogScopeKey } from "./scopes";

const LOGGER = {
  defaultScope: "Game",
  frameLimit: 500,
  // resets the valve when endFrame is not running yet (preload)
  valveResetMs: 100,
  mirrorMethod: {
    log: "log",
    success: "log",
    warn: "warn",
    error: "error",
    notify: "info",
  } satisfies Record<LogLevel, "log" | "info" | "warn" | "error">,
};

interface HandleFilter {
  throttleMs: number | null;
  once: boolean;
  changed: boolean;
}
const NO_FILTER: HandleFilter = { throttleMs: null, once: false, changed: false };

class LogChannel {
  public frame = 0;
  public nextId = 0;
  public sent = 0;
  public dropped = 0;
  public resetAt = performance.now();
  public dirty: LogHandle[] = [];

  constructor(public readonly mirrorToDevtools: boolean) {}

  public send(message: LogMessage) {
    window.API.DEBUG.sendLog(message);
  }
  // original arguments, not the snapshot, so devtools can expand them
  public mirror(scope: string, level: LogLevel, args: unknown[]) {
    console[LOGGER.mirrorMethod[level]](`${LOG_MIRROR_TAG}[${scope}]`, ...args);
  }
  public resetValve(now: number) {
    if (this.dropped > 0) {
      this.send({
        type: "entry",
        entry: {
          kind: "valve",
          id: this.nextId++,
          frame: this.frame,
          time: Date.now(),
          dropped: this.dropped,
        },
      });
      if (this.mirrorToDevtools)
        console.warn(
          `${LOG_MIRROR_TAG}[valve] dropped ${this.dropped} entries over the per-frame limit`,
        );
    }
    this.sent = 0;
    this.dropped = 0;
    this.resetAt = now;
  }
}

class LogHandle implements ILogHandle {
  private lastId = -1;
  private suppressed = 0;
  private reason: LogSuppressed["reason"] = "throttle";
  private dirty = false;
  // already in channel.dirty for this frame, a bump flushed by write() leaves it there
  private queued = false;
  private lastTime = -Infinity;
  private lastFrame = -1;
  private lastKey = "";

  constructor(
    protected readonly channel: LogChannel,
    private readonly scopeName: string,
    private readonly filter: HandleFilter,
  ) {}

  public log(...args: unknown[]) {
    this.write("log", args);
  }
  public success(...args: unknown[]) {
    this.write("success", args);
  }
  public warn(...args: unknown[]) {
    this.write("warn", args);
  }
  public error(...args: unknown[]) {
    this.write("error", args);
  }
  public notify(...args: unknown[]) {
    this.write("notify", args);
  }
  public throttle(ms: number): ILogHandle {
    return this.derive({ ...this.filter, throttleMs: ms });
  }
  public changed(): ILogHandle {
    return this.derive({ ...this.filter, changed: true });
  }
  public once(): ILogHandle {
    return this.derive({ ...this.filter, once: true });
  }

  public flushFrame() {
    this.queued = false;
    this.flushBump();
  }

  private flushBump() {
    if (!this.dirty) return;
    this.dirty = false;
    this.channel.send({
      type: "bump",
      id: this.lastId,
      suppressed: { count: this.suppressed, reason: this.reason },
    });
  }

  private derive(filter: HandleFilter) {
    return new LogHandle(this.channel, this.scopeName, filter);
  }

  private write(level: LogLevel, args: unknown[]) {
    const channel = this.channel;
    const filter = this.filter;
    const now = performance.now();
    if (now - channel.resetAt > LOGGER.valveResetMs) channel.resetValve(now);

    if (filter.once && this.lastId >= 0) return this.suppress("once");
    if (filter.throttleMs !== null) {
      // before the loop runs the frame never advances, so "once per frame" falls back to the valve interval
      const open =
        filter.throttleMs === 0
          ? this.lastFrame !== channel.frame ||
            now - this.lastTime >= LOGGER.valveResetMs
          : now - this.lastTime >= filter.throttleMs;
      if (!open) return this.suppress("throttle");
      this.lastTime = now;
      this.lastFrame = channel.frame;
    }
    if (level !== "error" && channel.sent >= LOGGER.frameLimit) {
      channel.dropped++;
      return;
    }

    const parts = args.map(serialize);
    let key = "";
    if (filter.changed) {
      key = JSON.stringify(parts);
      if (this.lastId >= 0 && key === this.lastKey)
        return this.suppress("changed");
    }

    // the previous entry's counter must not be lost when this one replaces it
    this.flushBump();
    channel.sent++;
    this.lastId = channel.nextId++;
    this.lastKey = key;
    this.suppressed = 0;
    channel.send({
      type: "entry",
      entry: {
        kind: "entry",
        id: this.lastId,
        frame: channel.frame,
        time: Date.now(),
        scope: this.scopeName,
        level,
        parts,
      },
    });
    if (channel.mirrorToDevtools) channel.mirror(this.scopeName, level, args);
  }

  private suppress(reason: LogSuppressed["reason"]) {
    if (this.lastId < 0) return;
    this.suppressed++;
    this.reason = reason;
    this.dirty = true;
    if (this.queued) return;
    this.queued = true;
    this.channel.dirty.push(this);
  }
}

export class DevLogger extends LogHandle implements ILogger {
  private scopes = new Map<string, LogHandle>();

  constructor(options: { mirrorToDevtools: boolean }) {
    super(
      new LogChannel(options.mirrorToDevtools),
      LOGGER.defaultScope,
      NO_FILTER,
    );
  }

  public scope(key: LogScopeKey): ILogHandle {
    return this.named(LOG_SCOPE[key]);
  }

  public named(name: string): ILogHandle {
    let handle = this.scopes.get(name);
    if (!handle) {
      handle = new LogHandle(this.channel, name, NO_FILTER);
      this.scopes.set(name, handle);
    }
    return handle;
  }

  public endFrame() {
    const channel = this.channel;
    for (const handle of channel.dirty) handle.flushFrame();
    channel.dirty.length = 0;
    channel.resetValve(performance.now());
    channel.frame++;
  }
}

const noop = () => {};
export const prodLogger: ILogger = {
  log: noop,
  success: noop,
  warn: noop,
  error: noop,
  notify: noop,
  scope: () => prodLogger,
  throttle: () => prodLogger,
  changed: () => prodLogger,
  once: () => prodLogger,
  endFrame: noop,
};
