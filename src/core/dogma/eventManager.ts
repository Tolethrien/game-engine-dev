import DogmaScene from "./scene";
import DogmaSystem from "./system";

export type EventData = Record<string, unknown>;
interface Subscriber {
  callback: (data: EventData) => void;
  ID: Symbol;
}
interface DeferredSubscriber {
  eventName: string;
  sysRef: DogmaSystem;
  callback: (EventData: EventData) => void;
  after?: DogmaSystemRegistryKeys[];
  before?: DogmaSystemRegistryKeys[];
}
type TimeMode = "immediate" | "deferred";
interface TimeEvent {
  eventName: string;
  data: EventData;
  remainingTime: number; // in ms
  mode: TimeMode;
  interval?: number;
  nextTickTime?: number;
}
interface DelayProps {
  eventName: string;
  data: EventData;
  delaySeconds: number;
  mode: TimeMode;
}
interface IntervalProps {
  eventName: string;
  data: EventData;
  intervalSeconds: number;
  totalSeconds: number;
  mode: TimeMode;
}
export default class EventManager {
  private parentScene: DogmaScene;
  private immediateEvents: Map<string, Map<Symbol, Subscriber>> = new Map();
  private deferredEvents: Map<string, EventData[]> = new Map();
  private cascadeEvents: Map<string, EventData[]> = new Map();
  private timeEvents: TimeEvent[] = [];
  public constructor(parentScene: DogmaScene) {
    this.parentScene = parentScene;
  }

  public emitImmediate(eventName: string, data: EventData) {
    const event = this.immediateEvents.get(eventName);
    if (!event) {
      console.warn(`There is no immediate event with name: ${eventName}`);
      return;
    }
    event.forEach((event) => event.callback(data));
  }
  public subscribeToImmediate(
    eventName: string,
    callback: (EventData: EventData) => void,
  ) {
    let subscribers = this.immediateEvents.get(eventName);
    if (!subscribers) {
      subscribers = new Map();
      this.immediateEvents.set(eventName, subscribers);
    }
    const ID = Symbol();
    subscribers.set(ID, { callback, ID });
    return ID;
  }
  public unsubscribeFromImmediate(eventName: string, ID: Symbol) {
    const subscribers = this.immediateEvents.get(eventName);
    if (!subscribers) return;
    subscribers.delete(ID);
    if (subscribers.size === 0) this.immediateEvents.delete(eventName);
  }
  public emitDeferred(eventName: string, data: EventData) {
    let event = this.deferredEvents.get(eventName);
    if (!event) {
      event = [];
      this.deferredEvents.set(eventName, event);
    }
    event.push(data);
  }

  public subscribeToDeferred(subscriber: DeferredSubscriber) {
    const key =
      `Event(${subscriber.eventName})InSystem(${subscriber.sysRef.systemName})` as DogmaSystemRegistryKeys;
    this.parentScene.addToDeferred({
      phaseName: "eventsDeferred",
      after: new Set(subscriber.after ?? []),
      before: new Set(subscriber.before ?? []),
      callback: () => {
        const events = this.deferredEvents.get(subscriber.eventName);
        if (!events) return;
        events.forEach((eventData) => subscriber.callback(eventData));
      },
      sysRef: subscriber.sysRef,
      systemName: key,
    });
    return key;
  }
  public unsubscribeFromDeferred(key: string) {
    this.parentScene.removeFromDeferred({
      phaseName: "eventsDeferred",
      systemName: key as DogmaSystemRegistryKeys,
    });
  }

  public emitCascade(eventName: string, data: EventData) {
    let event = this.cascadeEvents.get(eventName);
    if (!event) {
      event = [];
      this.cascadeEvents.set(eventName, event);
    }
    event.push(data);
  }
  public getCascade(eventName: string) {
    return this.cascadeEvents.get(eventName);
  }
  public deleteCascadeEvent(eventName: string) {
    this.cascadeEvents.delete(eventName);
  }
  public flush() {
    this.cascadeEvents.clear();
    this.deferredEvents.clear();
  }
  public emitDelayed({ data, delaySeconds, eventName, mode }: DelayProps) {
    this.timeEvents.push({
      eventName,
      data,
      remainingTime: delaySeconds * 1000,
      mode,
    });
  }
  public emitInterval(props: IntervalProps) {
    const intervalMs = props.intervalSeconds * 1000;
    this.timeEvents.push({
      eventName: props.eventName,
      data: props.data,
      remainingTime: props.totalSeconds * 1000,
      mode: props.mode,
      interval: intervalMs,
      nextTickTime: intervalMs,
    });
  }
  public updateTimers(dtMs: number) {
    if (this.timeEvents.length === 0) return;

    for (let i = this.timeEvents.length - 1; i >= 0; i--) {
      const event = this.timeEvents[i];
      event.remainingTime -= dtMs;

      if (!event.interval) {
        if (event.remainingTime > 0) continue;
        if (event.mode === "immediate")
          this.emitImmediate(event.eventName, event.data);
        else if (event.mode === "deferred")
          this.emitDeferred(event.eventName, event.data);
        this.timeEvents.splice(i, 1);
        continue;
      }
      event.nextTickTime! -= dtMs;
      if (event.nextTickTime! <= 0) {
        if (event.mode === "immediate")
          this.emitImmediate(event.eventName, event.data);
        else if (event.mode === "deferred")
          this.emitDeferred(event.eventName, event.data);
        event.nextTickTime! += event.interval;
      }
      if (event.remainingTime <= 0) this.timeEvents.splice(i, 1);
    }
  }
}
