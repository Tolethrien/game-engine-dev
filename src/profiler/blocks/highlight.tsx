import { Show } from "solid-js";

export default function Highlight(props: { text: string; query: string }) {
  const position = () =>
    props.query ? props.text.toLowerCase().indexOf(props.query.toLowerCase()) : -1;
  return (
    <Show when={position() >= 0} fallback={props.text}>
      {props.text.slice(0, position())}
      <mark class="bg-warn/30 text-inherit">
        {props.text.slice(position(), position() + props.query.length)}
      </mark>
      {props.text.slice(position() + props.query.length)}
    </Show>
  );
}
