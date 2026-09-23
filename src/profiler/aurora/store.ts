import { createSignal } from "solid-js";
import { sampleStats } from "./stats";

// 5 s and 30 s at AURORA_REPORT.intervalMs = 250
export const AURORA_HISTORY = { statsReports: 20, graphReports: 120 };

type Series = AuroraReport["series"];

const [reports, setReports] = createSignal<Series[]>([]);
const [state, setState] = createSignal<AuroraState | null>(null);
const [events, setEvents] = createSignal<Map<string, DebugEvent>>(new Map());
const [keyOrder, setKeyOrder] = createSignal<string[]>([]);
const [timelines, setTimelines] = createSignal<GpuTimelineFrame[]>([]);
const knownKeys: Set<string> = new Set();

window.API.DEBUG.onAuroraReport((report) => {
  const added: string[] = [];
  for (const key in report.series) {
    if (knownKeys.has(key)) continue;
    knownKeys.add(key);
    added.push(key);
  }
  if (added.length > 0) setKeyOrder((previous) => [...previous, ...added]);

  setReports((previous) => [
    ...previous.slice(-(AURORA_HISTORY.graphReports - 1)),
    report.series,
  ]);
  const timeline = report.timeline;
  if (timeline) {
    setTimelines((previous) => [
      ...previous.slice(-(AURORA_HISTORY.statsReports - 1)),
      timeline,
    ]);
  }
  if (report.state) setState(report.state);
  if (report.events) {
    const next = new Map(events());
    for (const event of report.events) {
      next.set(`${event.type}|${event.message}`, event);
    }
    setEvents(next);
  }
});

window.API.DEBUG.onGameReloaded(() => {
  setReports([]);
  setState(null);
  setEvents(new Map());
  setTimelines([]);
  knownKeys.clear();
  setKeyOrder([]);
});

function timelinePeak() {
  let peak: GpuTimelineFrame | null = null;
  for (const timeline of timelines()) {
    if (!peak || timeline.span > peak.span) peak = timeline;
  }
  return peak;
}

function values(key: string, reportCount: number) {
  const result: number[] = [];
  for (const series of reports().slice(-reportCount)) {
    const list = series[key];
    if (list) result.push(...list);
  }
  return result;
}

export const auroraStore = {
  values,
  stats: (key: string) => sampleStats(values(key, AURORA_HISTORY.statsReports)),
  keys: keyOrder,
  events,
  live: () => reports().length > 0,
  latestState: state,
  timelineLast: () => timelines().at(-1) ?? null,
  timelinePeak,
};
