import { For } from "solid-js";
import CollapsiblePanel, {
  PanelProps,
  Section,
  Slot,
  SlotGroup,
} from "../components/panel";
import Stat from "../components/stat";
import { Table, TableCell, TableRow } from "../components/table";
import { useDebugHistory } from "../hooks/useDebugHistory";

export default function AuroraPanel(props: PanelProps) {
  const history = useDebugHistory(window.API.DEBUG.onAuroraSnapshot);
  const latest = () => history().at(-1);
  const count = (value?: number) => value?.toLocaleString() ?? "—";
  const counterGroups = () => Object.entries(latest()?.counters ?? {});

  return (
    <CollapsiblePanel
      id="aurora"
      title="Aurora"
      live={history().length > 0}
      defaultPinned={["drawCalls", "instances"]}
      dragHandle={props.dragHandle}
    >
      <Section>Calls</Section>

      <SlotGroup>
        <Slot id="drawCalls" align="center">
          <Stat label="Draw" value={count(latest()?.drawCalls)} />
        </Slot>
        <Slot id="computeCalls" align="center">
          <Stat label="Compute" value={count(latest()?.computeCalls)} />
        </Slot>
        <Slot id="totalCalls" align="center">
          <Stat label="Total" value={count(latest()?.totalCalls)} />
        </Slot>
      </SlotGroup>

      <Section>Passes</Section>

      <SlotGroup>
        <Slot id="renderPasses" align="center">
          <Stat label="Render" value={count(latest()?.renderPasses)} />
        </Slot>
        <Slot id="computePasses" align="center">
          <Stat label="Compute" value={count(latest()?.computePasses)} />
        </Slot>
        <Slot id="clearPasses" align="center">
          <Stat label="Clear" value={count(latest()?.clearPasses)} />
        </Slot>
      </SlotGroup>

      <Section>Geometry</Section>

      <SlotGroup>
        <Slot id="instances" align="center">
          <Stat label="Instances" value={count(latest()?.instances)} />
        </Slot>
        <Slot id="triangles" align="center">
          <Stat label="Triangles" value={count(latest()?.triangles)} />
        </Slot>
        <Slot id="vertices" align="center">
          <Stat label="Vertices" value={count(latest()?.vertices)} />
        </Slot>
      </SlotGroup>

      <Section>Counters</Section>

      <For each={counterGroups()}>
        {([group, values]) => (
          <SlotGroup>
            <For each={Object.entries(values)}>
              {([label, value]) => (
                <Slot id={`counter:${group}.${label}`} align="center">
                  <Stat label={`${group} ${label}`} value={count(value)} />
                </Slot>
              )}
            </For>
          </SlotGroup>
        )}
      </For>

      <Section>Resources</Section>

      <SlotGroup>
        <Slot id="textures" align="center">
          <Stat label="Textures" value={count(latest()?.textures)} />
        </Slot>
      </SlotGroup>

      <Section>Passes in use</Section>

      <Slot pinnable={false} align="center">
        <Table columns="auto">
          <TableRow head>
            <TableCell>Name</TableCell>
          </TableRow>
          <For each={latest()?.pipelineInUse ?? []}>
            {(name) => (
              <TableRow>
                <TableCell>{name}</TableCell>
              </TableRow>
            )}
          </For>
        </Table>
      </Slot>
    </CollapsiblePanel>
  );
}
