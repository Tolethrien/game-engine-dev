import StatGrid from "../../blocks/statGrid";
import { Block, Rows } from "../../grid/layout";
import { auroraData } from "../../data";
import { formatCount } from "../../format";

export default function AuroraCallsPanel() {
  const latest = () => auroraData.latest();

  return (
    <Rows>
      <Block size="fill">
        <StatGrid
          stats={[
            { label: "Draw", value: formatCount(latest()?.calls.draw) },
            { label: "Compute", value: formatCount(latest()?.calls.compute) },
            { label: "Render p.", value: formatCount(latest()?.passes.render) },
            {
              label: "Compute p.",
              value: formatCount(latest()?.passes.compute),
            },
            { label: "Clear p.", value: formatCount(latest()?.passes.clear) },
          ]}
        />
      </Block>
    </Rows>
  );
}
