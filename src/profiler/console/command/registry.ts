import { createSignal } from "solid-js";
import type {
  CommandEntry,
  CommandRegistryMessage,
} from "@/core/debugger/modules/command/report";

const [entries, setEntries] = createSignal<CommandEntry[]>([]);

const history = {
  ready: false,
  queue: [] as CommandRegistryMessage[],
};

function apply(message: CommandRegistryMessage) {
  if (message.type === "add") {
    const entry = message.entry;
    setEntries((previous) => {
      const index = previous.findIndex((item) => item.name === entry.name);
      if (index < 0) return [...previous, entry];
      const next = [...previous];
      next[index] = entry;
      return next;
    });
  } else
    setEntries((previous) => previous.filter((item) => item.name !== message.name));
}

window.API.DEBUG.onCommandRegistry((message) => {
  if (history.ready) apply(message);
  else history.queue.push(message);
});

window.API.DEBUG.getCommandRegistry().then((list) => {
  setEntries(list);
  history.queue.forEach(apply);
  history.queue.length = 0;
  history.ready = true;
});

window.API.DEBUG.onGameReloaded(() => setEntries([]));

export const commandRegistry = {
  entries,
  find: (name: string) => entries().find((entry) => entry.name === name),
};
