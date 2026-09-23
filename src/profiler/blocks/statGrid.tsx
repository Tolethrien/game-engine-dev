import { Index } from "solid-js";
import Stat, { type StatProps } from "./stat";

export default function StatGrid(props: { stats: Omit<StatProps, "big">[] }) {
  return (
    <div class="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-x-3 gap-y-2">
      <Index each={props.stats}>
        {(stat) => (
          <Stat label={stat().label} value={stat().value} unit={stat().unit} />
        )}
      </Index>
    </div>
  );
}
