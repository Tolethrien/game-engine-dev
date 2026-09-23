import Graph from "../../blocks/graph";
import Stat from "../../blocks/stat";
import { Block, Rows } from "../../grid/layout";
import { HISTORY_SAMPLES, auroraData } from "../../data";
import { formatMs } from "../../format";

export default function AuroraGpuPanel() {
  const history = () => auroraData.history();

  return (
    <Rows>
      <Block size="fill">
        <Stat
          big
          label="GPU"
          value={formatMs(auroraData.latest()?.gpu.time)}
          unit="ms"
        />
      </Block>
      <Block size="fill">
        <Graph
          capacity={HISTORY_SAMPLES}
          series={[
            {
              values: history().map((snapshot) => snapshot.gpu.timeMax),
              color: "var(--color-fg-dim)",
            },
            {
              values: history().map((snapshot) => snapshot.gpu.time),
              color: "var(--color-live)",
              fill: true,
            },
          ]}
        />
      </Block>
    </Rows>
  );
}
