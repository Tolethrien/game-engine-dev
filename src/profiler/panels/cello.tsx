import CollapsiblePanel, { PanelProps } from "../components/panel";

export default function CelloPanel(props: PanelProps) {
  return (
    <CollapsiblePanel
      id="cello"
      title="Cello Audio"
      live={false}
      dragHandle={props.dragHandle}
    />
  );
}
