import { For } from "solid-js";
import Stat, { type StatProps } from "./stat";

export default function StatGrid(props: { stats: Omit<StatProps, "big">[] }) {
  return (
    <div class="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-x-3 gap-y-2">
      <For each={props.stats}>{(stat) => <Stat {...stat} />}</For>
    </div>
  );
}
