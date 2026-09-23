import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import AxiomMath from "@/core/axiom/math";

export interface GraphSeries {
  values: (number | null)[];
  color: string;
  fill?: boolean;
}

interface Point {
  x: number;
  y: number;
}

const INSET = 2;

export default function Graph(props: {
  series: GraphSeries[];
  capacity: number;
  min?: number;
  max?: number;
  width?: number;
  height?: number;
  frame?: boolean;
}) {
  const [measured, setMeasured] = createSignal({ width: 0, height: 0 });
  const width = () => props.width ?? measured().width;
  const height = () => props.height ?? measured().height;

  const range = createMemo(() => {
    const min = props.min ?? 0;
    if (props.max !== undefined) return { min, max: props.max };

    let highest = -Infinity;
    for (const series of props.series)
      for (const value of series.values)
        if (value !== null && value > highest) highest = value;

    const max = highest > min ? min + (highest - min) * 1.1 : min + 1;
    return { min, max };
  });

  const coordinatesFor = (values: (number | null)[]) => {
    const step = (width() - INSET * 2) / Math.max(1, props.capacity - 1);
    const usable = height() - INSET * 2;
    const { min, max } = range();

    return values.map((value, index) => {
      if (value === null) return null;
      const fromRight = values.length - 1 - index;
      const normalized = AxiomMath.clamp((value - min) / (max - min), 0, 1);
      return {
        x: width() - INSET - fromRight * step,
        y: height() - INSET - normalized * usable,
      };
    });
  };

  const segmentsFor = (values: (number | null)[]) => {
    const segments: Point[][] = [];
    let current: Point[] = [];

    for (const point of coordinatesFor(values)) {
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

  const toPolyline = (points: Point[]) =>
    points
      .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(" ");

  const toPolygon = (points: Point[]) => {
    const baseline = height() - INSET;
    const first = points[0];
    const last = points[points.length - 1];
    return `${first.x.toFixed(2)},${baseline} ${toPolyline(points)} ${last.x.toFixed(2)},${baseline}`;
  };

  const measure = (element: HTMLDivElement) => {
    const observer = new ResizeObserver(([entry]) =>
      setMeasured({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  };

  const Svg = (svgProps: { class: string }) => (
    <svg
      class={svgProps.class}
      width={width()}
      height={height()}
      viewBox={`0 0 ${width()} ${height()}`}
    >
      <Show when={props.frame}>
        <rect
          class="fill-window stroke-outline"
          x="0.5"
          y="0.5"
          width={width() - 1}
          height={height() - 1}
          rx="2"
        />
      </Show>

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

  return (
    <Show
      when={props.width === undefined || props.height === undefined}
      fallback={<Svg class="block shrink-0" />}
    >
      {/* absolute svg so it never feeds back into the size it measures */}
      <div ref={measure} class="relative h-full min-h-0 w-full min-w-0">
        <Show when={width() > 0 && height() > 0}>
          <Svg class="absolute inset-0" />
        </Show>
      </div>
    </Show>
  );
}
