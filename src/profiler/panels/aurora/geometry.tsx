import StatGrid from "../../blocks/statGrid";
import { Block, Rows } from "../../grid/layout";
import { auroraData } from "../../data";
import { formatCount } from "../../format";

export default function AuroraGeometryPanel() {
  const geometry = () => auroraData.latest()?.geometry;

  return (
    <Rows>
      <Block size="fill">
        <StatGrid
          stats={[
            { label: "Instances", value: formatCount(geometry()?.instances) },
            { label: "Triangles", value: formatCount(geometry()?.triangles) },
            { label: "Vertices", value: formatCount(geometry()?.vertices) },
          ]}
        />
      </Block>
    </Rows>
  );
}
