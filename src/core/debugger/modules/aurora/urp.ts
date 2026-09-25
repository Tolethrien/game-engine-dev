import type { SortAnchor, SortMode } from "@/core/aurora/urp/urp";
import type { TweakField } from "../tweak/report";
import type { TweakPanel, UrpDebugData } from "../../interfaces";
import { formatLiteral } from "../command/parse";
import { auroraPage } from "./pages";

const SORT_MODES: readonly SortMode[] = ["none", "y", "layer", "y+x", "y+x+z"];
const SORT_ANCHORS: readonly SortAnchor[] = ["top", "center", "bottom"];

const DEFAULTS = {
  sortMode: "none",
  sortAnchor: "center",
  stepX: 1,
  stepY: 1,
  stepZ: 1,
  zMin: 0,
  zMax: 255,
};

// every change is a new URP.init and a graph rebuild, so numbers are sent on release
const number = (key: string): TweakField => ({
  key,
  control: { kind: "number", step: 0.1 },
  apply: "release",
});

// one section, so the export is a single URP.init line; toneMapping, bloom and lighting live in the mood page
export function urpPanel(urp: UrpDebugData): TweakPanel {
  return {
    title: "URP",
    ...auroraPage("urp"),
    sections: [
      {
        title: "Sort",
        call: "URP.init",
        arg: "object",
        fields: [
          { key: "sortMode", control: { kind: "select", options: SORT_MODES } },
          { key: "sortAnchor", control: { kind: "select", options: SORT_ANCHORS } },
          number("stepX"),
          number("stepY"),
          number("stepZ"),
          number("zMin"),
          number("zMax"),
        ],
        defaults: DEFAULTS,
        get() {
          const { sortMode, sortAnchor, step, zRange } = urp.get();
          return {
            sortMode,
            sortAnchor,
            stepX: step.x,
            stepY: step.y,
            stepZ: step.z,
            zMin: zRange[0],
            zMax: zRange[1],
          };
        },
        set(values) {
          const current = urp.get();
          urp.apply({
            sortMode: (values.sortMode as SortMode) ?? current.sortMode,
            sortAnchor: (values.sortAnchor as SortAnchor) ?? current.sortAnchor,
            step: {
              x: (values.stepX as number) ?? current.step.x,
              y: (values.stepY as number) ?? current.step.y,
              z: (values.stepZ as number) ?? current.step.z,
            },
            zRange: [
              (values.zMin as number) ?? current.zRange[0],
              (values.zMax as number) ?? current.zRange[1],
            ],
          });
        },
        format(values) {
          const current = urp.get();
          const props: Record<string, unknown> = {};
          if (values.sortMode !== undefined) props.sortMode = values.sortMode;
          if (values.sortAnchor !== undefined) props.sortAnchor = values.sortAnchor;
          const step = {
            ...(values.stepX !== undefined && { x: values.stepX }),
            ...(values.stepY !== undefined && { y: values.stepY }),
            ...(values.stepZ !== undefined && { z: values.stepZ }),
          };
          if (Object.keys(step).length > 0) props.step = step;
          if (values.zMin !== undefined || values.zMax !== undefined)
            props.zRange = [values.zMin ?? current.zRange[0], values.zMax ?? current.zRange[1]];
          return `URP.init(${formatLiteral(props)})`;
        },
      },
    ],
  };
}
