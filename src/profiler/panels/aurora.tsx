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
  const list = (values?: string[]) =>
    values?.length ? values.join(", ") : "—";
  const text = (value?: string) => value ?? "—";

  return (
    <CollapsiblePanel
      id="aurora"
      title="Aurora"
      live={history().length > 0}
      defaultPinned={["drawCalls", "drawnQuads"]}
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
      </SlotGroup>

      <Section>Geometry</Section>

      <SlotGroup>
        <Slot id="drawnQuads" align="center">
          <Stat label="Quads" value={count(latest()?.drawnQuads)} />
        </Slot>
        <Slot id="drawnLights" align="center">
          <Stat label="Lights" value={count(latest()?.drawnLights)} />
        </Slot>
        <Slot id="drawnGui" align="center">
          <Stat label="GUI" value={count(latest()?.drawnGui)} />
        </Slot>
      </SlotGroup>

      <SlotGroup>
        <Slot id="drawnTriangles" align="center">
          <Stat label="Triangles" value={count(latest()?.drawnTriangles)} />
        </Slot>
        <Slot id="drawnVertices" align="center">
          <Stat label="Vertices" value={count(latest()?.drawnVertices)} />
        </Slot>
      </SlotGroup>

      <Section>Pipelines</Section>
      <SlotGroup>
        <Slot pinnable={false} align="center">
          <Table columns="auto">
            <TableRow head>
              <TableCell>In use</TableCell>
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

        <Slot pinnable={false} align="center">
          <Table columns="auto">
            <TableRow head>
              <TableCell>Effect</TableCell>
            </TableRow>

            <For each={latest()?.usedPostProcessing ?? []}>
              {(effect) => (
                <TableRow>
                  <TableCell>{effect}</TableCell>
                </TableRow>
              )}
            </For>
          </Table>
        </Slot>
      </SlotGroup>

      <Section>Config</Section>

      <Slot pinnable={false} align="center">
        <Table columns="auto auto">
          <TableRow head>
            <TableCell>Setting</TableCell>
            <TableCell>Value</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Sort order</TableCell>
            <TableCell>{text(latest()?.sortOrder)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Draw origin</TableCell>
            <TableCell>{text(latest()?.drawOrigin)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Displayed texture</TableCell>
            <TableCell>{text(latest()?.displayedTexture)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Global illumination</TableCell>
            <TableCell>
              {latest()?.globalIllumination.join(", ") ?? "—"}
            </TableCell>
          </TableRow>
        </Table>
      </Slot>
    </CollapsiblePanel>
  );
}
