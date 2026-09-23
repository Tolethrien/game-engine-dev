import type { GraphTexture } from "@/core/aurora/renderGraph";
import Table from "../../blocks/table";
import { Block, Rows } from "../../grid/layout";
import { auroraData } from "../../data";

function mipsLayers(texture: GraphTexture) {
  const parts: string[] = [];
  if (texture.mips > 1) parts.push(`${texture.mips} mips`);
  if (texture.layers > 1) parts.push(`${texture.layers} layers`);
  return parts.join(", ");
}

export default function AuroraResourcesPanel() {
  const rows = () =>
    (auroraData.latest()?.resources.textures ?? []).map((texture) => [
      texture.name,
      texture.kind,
      texture.format,
      `${texture.width}×${texture.height}`,
      mipsLayers(texture),
      texture.createdBy,
      texture.usedBy.join(", "),
    ]);

  return (
    <Rows>
      <Block size="fill">
        <Table
          columns={[
            { label: "Name" },
            { label: "Kind", width: "auto" },
            { label: "Format", width: "auto" },
            { label: "Size", width: "auto", align: "right" },
            { label: "Mips/Layers", width: "auto", align: "right" },
            { label: "Created by" },
            { label: "Used by" },
          ]}
          rows={rows()}
          empty="no textures"
        />
      </Block>
    </Rows>
  );
}
