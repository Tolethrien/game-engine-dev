import { For } from "solid-js";
import type { GraphTexture } from "@/core/aurora/renderGraph";
import CollapsiblePanel, {
  PanelProps,
  Section,
  Slot,
  SlotGroup,
} from "../components/panel";
import Stat from "../components/stat";
import { Table, TableCell, TableRow } from "../components/table";
import { useDebugHistory } from "../hooks/useDebugHistory";

function mipsLayers(texture: GraphTexture) {
  const parts: string[] = [];
  if (texture.mips > 1) parts.push(`${texture.mips} mips`);
  if (texture.layers > 1) parts.push(`${texture.layers} layers`);
  return parts.join(", ");
}

export default function AuroraPanel(props: PanelProps) {
  const history = useDebugHistory(window.API.DEBUG.onAuroraSnapshot);
  const latest = () => history().at(-1);
  const count = (value?: number) => value?.toLocaleString() ?? "—";
  const totalCalls = () => {
    const calls = latest()?.calls;
    return calls && calls.draw + calls.compute;
  };
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
          <Stat label="Draw" value={count(latest()?.calls.draw)} />
        </Slot>
        <Slot id="computeCalls" align="center">
          <Stat label="Compute" value={count(latest()?.calls.compute)} />
        </Slot>
        <Slot id="totalCalls" align="center">
          <Stat label="Total" value={count(totalCalls())} />
        </Slot>
      </SlotGroup>

      <Section>Passes</Section>

      <SlotGroup>
        <Slot id="renderPasses" align="center">
          <Stat label="Render" value={count(latest()?.passes.render)} />
        </Slot>
        <Slot id="computePasses" align="center">
          <Stat label="Compute" value={count(latest()?.passes.compute)} />
        </Slot>
        <Slot id="clearPasses" align="center">
          <Stat label="Clear" value={count(latest()?.passes.clear)} />
        </Slot>
      </SlotGroup>

      <Section>Geometry</Section>

      <SlotGroup>
        <Slot id="instances" align="center">
          <Stat label="Instances" value={count(latest()?.geometry.instances)} />
        </Slot>
        <Slot id="triangles" align="center">
          <Stat label="Triangles" value={count(latest()?.geometry.triangles)} />
        </Slot>
        <Slot id="vertices" align="center">
          <Stat label="Vertices" value={count(latest()?.geometry.vertices)} />
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

      <Slot pinnable={false} align="center">
        <Table columns="1fr auto auto auto auto 1fr 1fr">
          <TableRow head>
            <TableCell>Name</TableCell>
            <TableCell>Kind</TableCell>
            <TableCell>Format</TableCell>
            <TableCell align="right">Size</TableCell>
            <TableCell align="right">Mips/Layers</TableCell>
            <TableCell>Created by</TableCell>
            <TableCell>Used by</TableCell>
          </TableRow>
          <For each={latest()?.resources.textures ?? []}>
            {(texture) => (
              <TableRow>
                <TableCell>{texture.name}</TableCell>
                <TableCell>{texture.kind}</TableCell>
                <TableCell>{texture.format}</TableCell>
                <TableCell align="right">
                  {texture.width}×{texture.height}
                </TableCell>
                <TableCell align="right">{mipsLayers(texture)}</TableCell>
                <TableCell>{texture.createdBy}</TableCell>
                <TableCell>{texture.usedBy.join(", ")}</TableCell>
              </TableRow>
            )}
          </For>
        </Table>
      </Slot>
    </CollapsiblePanel>
  );
}
