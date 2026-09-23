import Table from "../../blocks/table";
import { Block, Rows } from "../../grid/layout";

// mockup to check scrolling inside a fill block, remove once a real long list exists
const MOCK_ROWS = Array.from({ length: 60 }, (_, index) => [
  `mock item ${index + 1}`,
  `${(index * 0.137).toFixed(3)}`,
]);

export default function AuroraMockListPanel() {
  return (
    <Rows>
      <Block size="fill">
        <Table
          columns={[
            { label: "Item" },
            { label: "Value", width: "auto", align: "right" },
          ]}
          rows={MOCK_ROWS}
        />
      </Block>
    </Rows>
  );
}
