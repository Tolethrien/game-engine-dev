import Table from "../../blocks/table";
import { Block, Rows } from "../../grid/layout";
import { auroraData } from "../../data";
import { formatMs } from "../../format";

export default function AuroraPassTimesPanel() {
  const rows = () =>
    (auroraData.latest()?.gpu.passes ?? []).map((pass) => [
      pass.name,
      formatMs(pass.time, 3),
      formatMs(pass.max, 3),
    ]);

  return (
    <Rows>
      <Block size="fill">
        <Table
          columns={[
            { label: "Pass" },
            { label: "Avg ms", width: "auto", align: "right" },
            { label: "Max ms", width: "auto", align: "right" },
          ]}
          rows={rows()}
          empty="no passes"
        />
      </Block>
    </Rows>
  );
}
