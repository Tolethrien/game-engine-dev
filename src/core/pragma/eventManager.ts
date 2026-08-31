export class Signal<T> {
  private listeners: Set<(data: T) => void> = new Set();
  emit(data: T) {
    this.listeners.forEach((cb) => cb(data));
  }
  connect(cb: (data: T) => void) {
    this.listeners.add(cb);
  }
  disconnect(cb: (data: T) => void) {
    this.listeners.delete(cb);
  }
}

export class EventBus {
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  emit<T>(name: string, data: T) {
    this.listeners.get(name)?.forEach((cb) => cb(data));
  }
  on<T>(name: string, cb: (data: T) => void) {
    let subs = this.listeners.get(name);
    if (!subs) {
      subs = new Set();
      this.listeners.set(name, subs);
    }
    subs.add(cb);
  }
  off<T>(name: string, cb: (data: T) => void) {
    this.listeners.get(name)?.delete(cb);
  }
}
export class IntervalTimer {
  private elapsed = 0;
  private totalElapsed = 0;
  private done = false;

  constructor(
    private interval: number,
    private callback: () => void,
    private duration: number = 0, // 0 infinity
  ) {}

  public isDone() {
    return this.done;
  }

  tick(dt: number) {
    if (this.done) return;

    this.elapsed += dt;
    while (this.elapsed >= this.interval) {
      this.elapsed -= this.interval;
      this.callback();
    }

    if (this.duration > 0) {
      this.totalElapsed += dt;
      if (this.totalElapsed >= this.duration) this.done = true;
    }
  }
}
export class Timer {
  private remaining: number;
  private callback: () => void;
  private done = false;
  constructor(seconds: number, callback: () => void) {
    this.remaining = seconds;
    this.callback = callback;
  }
  tick(dt: number) {
    if (this.done || (this.remaining -= dt) > 0) return;
    this.done = true;
    this.callback();
  }
}
export class SharedData {
  private storage: Map<string, any> = new Map();
  public add<T>(name: string, data: T) {
    if (this.storage.has(name)) {
      console.warn(
        `sharedDataStorage already has key:${name}, use set instead to modify data`,
      );
      return;
    }
    this.storage.set(name, data);
  }
  public set<T>(name: string, data: T) {
    this.storage.set(name, data);
  }
  public get<T>(name: string) {
    return this.storage.get(name) as T | undefined;
  }
  public delete(name: string) {
    this.storage.delete(name);
  }
  public has(name: string) {
    return this.storage.has(name);
  }
}
