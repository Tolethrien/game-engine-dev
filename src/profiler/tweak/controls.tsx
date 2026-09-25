import { For, Match, Switch } from "solid-js";
import AxiomColor from "@/core/axiom/color";
import AxiomMath from "@/core/axiom/math";
import type { TweakControl } from "@/core/debugger/modules/tweak/report";
import { formatLiteral } from "@/core/debugger/modules/command/parse";
import Dropdown, { DropdownCheck } from "../blocks/dropdown";

interface ControlProps<Control extends TweakControl> {
  control: Control;
  value: unknown;
  onChange: (value: unknown) => void;
  onBegin: () => void;
  onEnd: () => void;
}

const NUMBER_INPUT =
  "w-16 rounded border border-divider bg-window px-1 text-right tabular-nums text-fg outline-none focus:border-outline";
const RANGE_INPUT = "min-w-0 flex-1 cursor-pointer accent-live";

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}

function NumberField(props: {
  value: number;
  step?: number;
  onChange: (value: number) => void;
  onBegin: () => void;
  onEnd: () => void;
}) {
  return (
    <input
      type="number"
      class={NUMBER_INPUT}
      value={round(props.value)}
      step={props.step ?? "any"}
      onFocus={props.onBegin}
      onBlur={props.onEnd}
      onInput={(event) => {
        const parsed = event.currentTarget.valueAsNumber;
        if (!Number.isNaN(parsed)) props.onChange(parsed);
      }}
    />
  );
}

function RangeField(props: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onBegin: () => void;
  onEnd: () => void;
}) {
  return (
    <input
      type="range"
      class={RANGE_INPUT}
      min={props.min}
      max={props.max}
      step={props.step}
      value={props.value}
      onPointerDown={props.onBegin}
      onChange={props.onEnd}
      onBlur={props.onEnd}
      onInput={(event) => props.onChange(event.currentTarget.valueAsNumber)}
    />
  );
}

function SliderControl(props: ControlProps<Extract<TweakControl, { kind: "slider" }>>) {
  const number = () => props.value as number;
  return (
    <>
      <RangeField
        value={number()}
        min={props.control.min}
        max={props.control.max}
        step={props.control.step}
        onChange={props.onChange}
        onBegin={props.onBegin}
        onEnd={props.onEnd}
      />
      <NumberField
        value={number()}
        step={props.control.step}
        onChange={props.onChange}
        onBegin={props.onBegin}
        onEnd={props.onEnd}
      />
    </>
  );
}

function NumberControl(props: ControlProps<Extract<TweakControl, { kind: "number" }>>) {
  return (
    <NumberField
      value={props.value as number}
      step={props.control.step}
      onChange={props.onChange}
      onBegin={props.onBegin}
      onEnd={props.onEnd}
    />
  );
}

function AngleControl(props: ControlProps<Extract<TweakControl, { kind: "angle" }>>) {
  const degrees = () => AxiomMath.radToDeg(props.value as number);
  const change = (value: number) => props.onChange(AxiomMath.degToRad(value));
  return (
    <>
      <RangeField
        value={degrees()}
        min={0}
        max={360}
        step={1}
        onChange={change}
        onBegin={props.onBegin}
        onEnd={props.onEnd}
      />
      <NumberField
        value={degrees()}
        step={1}
        onChange={change}
        onBegin={props.onBegin}
        onEnd={props.onEnd}
      />
    </>
  );
}

function ColorControl(props: ControlProps<Extract<TweakControl, { kind: "color" }>>) {
  const rgba = () => props.value as RGBA;
  return (
    <>
      <input
        type="color"
        class="h-5 w-8 shrink-0 cursor-pointer border border-divider bg-transparent p-0"
        value={AxiomColor.rgbToHex(rgba().slice(0, 3) as RGB)}
        onPointerDown={props.onBegin}
        onChange={props.onEnd}
        onBlur={props.onEnd}
        onInput={(event) => {
          const [r, g, b] = AxiomColor.hexToRgb(event.currentTarget.value);
          props.onChange([r, g, b, rgba()[3]]);
        }}
      />
      <RangeField
        value={rgba()[3]}
        min={0}
        max={255}
        step={1}
        onChange={(alpha) => {
          const [r, g, b] = rgba();
          props.onChange([r, g, b, alpha]);
        }}
        onBegin={props.onBegin}
        onEnd={props.onEnd}
      />
      <NumberField
        value={rgba()[3]}
        step={1}
        onChange={(alpha) => {
          const [r, g, b] = rgba();
          props.onChange([r, g, b, alpha]);
        }}
        onBegin={props.onBegin}
        onEnd={props.onEnd}
      />
    </>
  );
}

function SelectControl(props: ControlProps<Extract<TweakControl, { kind: "select" }>>) {
  return (
    <Dropdown label={String(props.value)} align="right">
      <For each={props.control.options}>
        {(option) => (
          <DropdownCheck
            checked={option === props.value}
            onClick={() => props.onChange(option)}
          >
            {option}
          </DropdownCheck>
        )}
      </For>
    </Dropdown>
  );
}

function ToggleControl(props: ControlProps<Extract<TweakControl, { kind: "toggle" }>>) {
  return (
    <input
      type="checkbox"
      class="cursor-pointer accent-live"
      checked={props.value as boolean}
      onChange={(event) => props.onChange(event.currentTarget.checked)}
    />
  );
}

function PointControl(props: ControlProps<Extract<TweakControl, { kind: "point" }>>) {
  const point = () => props.value as Position2D;
  const axis = (name: "x" | "y") => (
    <>
      <span class="text-fg-dim">{name}</span>
      <RangeField
        value={point()[name]}
        min={0}
        max={1}
        step={0.01}
        onChange={(value) => props.onChange({ ...point(), [name]: value })}
        onBegin={props.onBegin}
        onEnd={props.onEnd}
      />
    </>
  );
  return (
    <div class="flex min-w-0 flex-1 items-center gap-2">
      {axis("x")}
      {axis("y")}
    </div>
  );
}

function InfoControl(props: { value: unknown }) {
  const text = () =>
    typeof props.value === "string" ? props.value : formatLiteral(props.value);
  return (
    <span class="min-w-0 flex-1 select-text whitespace-pre-wrap break-words font-mono text-caption text-fg">
      {text()}
    </span>
  );
}

export default function Control(props: ControlProps<TweakControl>) {
  return (
    <Switch>
      <Match when={props.control.kind === "info"}>
        <InfoControl value={props.value} />
      </Match>
      <Match when={props.control.kind === "slider"}>
        <SliderControl {...(props as ControlProps<Extract<TweakControl, { kind: "slider" }>>)} />
      </Match>
      <Match when={props.control.kind === "number"}>
        <NumberControl {...(props as ControlProps<Extract<TweakControl, { kind: "number" }>>)} />
      </Match>
      <Match when={props.control.kind === "angle"}>
        <AngleControl {...(props as ControlProps<Extract<TweakControl, { kind: "angle" }>>)} />
      </Match>
      <Match when={props.control.kind === "color"}>
        <ColorControl {...(props as ControlProps<Extract<TweakControl, { kind: "color" }>>)} />
      </Match>
      <Match when={props.control.kind === "select"}>
        <SelectControl {...(props as ControlProps<Extract<TweakControl, { kind: "select" }>>)} />
      </Match>
      <Match when={props.control.kind === "toggle"}>
        <ToggleControl {...(props as ControlProps<Extract<TweakControl, { kind: "toggle" }>>)} />
      </Match>
      <Match when={props.control.kind === "point"}>
        <PointControl {...(props as ControlProps<Extract<TweakControl, { kind: "point" }>>)} />
      </Match>
    </Switch>
  );
}
