import type {
  PreviewEntry,
  TexturePreview,
} from "@/core/aurora/urp/passes/previewPass";
import type { TweakField } from "../tweak/report";
import type { TweakPanel, TweakSection } from "../../interfaces";
import { auroraPage } from "./pages";

const OFF = "off";

const slider = (key: string, label: string, max: number): TweakField => ({
  key,
  label,
  control: { kind: "slider", min: 0, max, step: 1 },
});

function fieldsFor(preview: TexturePreview, entry: PreviewEntry | undefined) {
  const fields: TweakField[] = [
    {
      key: "texture",
      control: { kind: "select", options: [OFF, ...preview.entries().map((item) => item.label)] },
    },
  ];
  if (entry && entry.layers > 1)
    fields.push(slider("index", entry.dimension === "3d" ? "slice" : "layer", entry.layers - 1));
  if (entry && entry.mips > 1) fields.push(slider("mip", "mip", entry.mips - 1));
  return fields;
}

function titleFor(preview: TexturePreview, entry: PreviewEntry | undefined) {
  if (!entry) return "Off";
  const mips = entry.mips > 1 ? ` · ${entry.mips} mips` : "";
  const written = preview.getWritten ? "" : " · not written this frame";
  return `${entry.label} · ${entry.format} ${entry.width}×${entry.height}${mips}${written}`;
}

export function previewPanel(preview: TexturePreview): TweakPanel {
  const selected = () => {
    const { target } = preview.getSelection;
    return preview.entries().find((entry) => entry.label === target);
  };
  return {
    title: "Texture view",
    ...auroraPage("texturePreview"),
    live: true,
    exportable: false,
    presets: false,
    get sections(): TweakSection[] {
      const entry = selected();
      return [
        {
          title: titleFor(preview, entry),
          call: "texturePreview",
          arg: "object",
          fields: fieldsFor(preview, entry),
          get() {
            const { target, layer, mip } = preview.getSelection;
            const values: Record<string, unknown> = { texture: target };
            if (entry && entry.layers > 1) values.index = layer;
            if (entry && entry.mips > 1) values.mip = mip;
            return values;
          },
          set(values) {
            if (typeof values.texture === "string") preview.select(values.texture);
            if (typeof values.index === "number") preview.setLayer(values.index);
            if (typeof values.mip === "number") preview.setMip(values.mip);
          },
        },
      ];
    },
  };
}
