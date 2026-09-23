import Table from "../../blocks/table";
import { Block, Rows } from "../../grid/layout";
import { auroraData } from "../../data";
import { formatCount } from "../../format";

export default function AuroraCountersPanel() {
  const rows = () =>
    Object.entries(auroraData.latest()?.counters ?? {}).flatMap(
      ([group, values]) =>
        Object.entries(values).map(([label, value]) => [
          group,
          label,
          formatCount(value),
        ]),
    );

  return (
    <Rows>
      <Block size="fill">
        <Table
          columns={[
            { label: "Group", width: "minmax(0,max-content)" },
            { label: "Label" },
            { label: "Value", width: "auto", align: "right" },
          ]}
          rows={rows()}
          empty="no counters"
        />
      </Block>
    </Rows>
  );
}
