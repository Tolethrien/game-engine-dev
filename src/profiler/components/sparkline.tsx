import { For, Show, createMemo } from "solid-js";

export interface SparklineSeries {
  values: (number | null)[];
  color: string;
  fill?: boolean;
}

export default function Sparkline(props: {
  series: SparklineSeries[];
  capacity: number;
  min?: number;
  max?: number;
  width?: number;
  height?: number;
}) {
  const width = () => props.width ?? 72;
  const height = () => props.height ?? 20;
  const inset = 2;

  const bounds = createMemo(() => {
    if (props.min !== undefined && props.max !== undefined) {
      return { min: props.min, max: props.max };
    }
    const all = props.series
      .flatMap((series) => series.values)
      .filter((value): value is number => value !== null);
    if (all.length === 0) return { min: 0, max: 1 };

    const min = all.reduce((low, value) => Math.min(low, value), Infinity);
    const max = all.reduce((high, value) => Math.max(high, value), -Infinity);
    return min === max ? { min: min - 1, max: max + 1 } : { min, max };
  });

  const coordinatesFor = (values: number[]) => {
    const { min, max } = bounds();
    const step = (width() - inset * 2) / Math.max(1, props.capacity - 1);
    const usable = height() - inset * 2;

    return values.map((value, index) => {
      if (value === null) return null;
      const fromRight = values.length - 1 - index;
      const normalized = (value - min) / (max - min);
      const clamped = Math.min(1, Math.max(0, normalized));
      return {
        x: width() - inset - fromRight * step,
        y: height() - inset - clamped * usable,
      };
    });
  };
  const segmentsFor = (values: (number | null)[]) => {
    const segments: { x: number; y: number }[][] = [];
    let current: { x: number; y: number }[] = [];

    for (const point of coordinatesFor(values as [])) {
      if (point) {
        current.push(point);
      } else if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    }
    if (current.length > 0) segments.push(current);

    return segments.filter((segment) => segment.length > 1);
  };
  const toPolyline = (points: { x: number; y: number }[]) =>
    points
      .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(" ");

  const toPolygon = (points: { x: number; y: number }[]) => {
    const baseline = height() - inset;
    const first = points[0];
    const last = points[points.length - 1];
    return `${first.x.toFixed(2)},${baseline} ${toPolyline(points)} ${last.x.toFixed(2)},${baseline}`;
  };

  return (
    <svg
      class="block shrink-0"
      width={width()}
      height={height()}
      viewBox={`0 0 ${width()} ${height()}`}
    >
      <rect
        class="fill-window stroke-outline"
        x="0.5"
        y="0.5"
        width={width() - 1}
        height={height() - 1}
        rx="2"
      />

      <For each={props.series}>
        {(series) => {
          const segments = createMemo(() => segmentsFor(series.values));
          return (
            <For each={segments()}>
              {(segment) => (
                <>
                  <Show when={series.fill}>
                    <polygon
                      points={toPolygon(segment)}
                      fill={series.color}
                      opacity="0.15"
                    />
                  </Show>
                  <polyline
                    points={toPolyline(segment)}
                    fill="none"
                    stroke={series.color}
                    stroke-width="1.25"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />
                </>
              )}
            </For>
          );
        }}
      </For>
    </svg>
  );
}
