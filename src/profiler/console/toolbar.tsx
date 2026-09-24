import { For, Show } from "solid-js";
import type { LogLevel } from "@/core/debugger/modules/log/report";
import Dropdown, {
  DROPDOWN_ITEM,
  DropdownCheck,
  DropdownDivider,
  DropdownHint,
} from "../blocks/dropdown";
import { formatBadgeCount } from "../format";
import {
  LEVELS,
  LEVEL_STYLE,
  clearConsole,
  dumpConsole,
  getCounts,
  getObjectCount,
  getScopes,
  hiddenLevels,
  hiddenScopes,
  keep,
  objectsOnly,
  query,
  setAllScopesVisible,
  setKeep,
  setObjectsOnly,
  setQuery,
  toggleLevel,
  toggleScope,
} from "./store";

const TOOLBAR = {
  quickLevels: ["error", "warn"] as LogLevel[],
  soloHint: "ctrl+click: only this",
  button: "shrink-0 cursor-pointer rounded border border-divider px-1.5 hover:text-fg",
};

const isSolo = (event: MouseEvent) => event.ctrlKey || event.metaKey;

function QuickCounter(props: { level: LogLevel }) {
  const hidden = () => hiddenLevels().includes(props.level);
  return (
    <button
      type="button"
      title={`click: show/hide, ${TOOLBAR.soloHint}`}
      class={TOOLBAR.button}
      classList={{ "line-through opacity-40": hidden() }}
      onClick={(event) => toggleLevel(props.level, isSolo(event))}
    >
      <span class={LEVEL_STYLE[props.level].text}>
        {LEVEL_STYLE[props.level].letter}
      </span>{" "}
      <span class="tabular-nums">
        {formatBadgeCount(getCounts()[props.level])}
      </span>
    </button>
  );
}

function LevelsMenu() {
  const filtering = () => hiddenLevels().length > 0 || objectsOnly();
  return (
    <Dropdown label="Levels" highlighted={filtering()}>
      <For each={LEVELS}>
        {(level) => (
          <DropdownCheck
            checked={!hiddenLevels().includes(level)}
            trailing={formatBadgeCount(getCounts()[level])}
            onClick={(event) => toggleLevel(level, isSolo(event))}
          >
            <span class={LEVEL_STYLE[level].text}>{level}</span>
          </DropdownCheck>
        )}
      </For>
      <DropdownDivider />
      <DropdownCheck
        checked={objectsOnly()}
        trailing={formatBadgeCount(getObjectCount())}
        onClick={() => setObjectsOnly(!objectsOnly())}
      >
        only objects
      </DropdownCheck>
      <DropdownHint>{TOOLBAR.soloHint}</DropdownHint>
    </Dropdown>
  );
}

function ScopesMenu() {
  return (
    <Dropdown label="Scopes" highlighted={hiddenScopes().length > 0}>
      <Show
        when={getScopes().length > 0}
        fallback={<DropdownHint>no scopes yet</DropdownHint>}
      >
        <For each={getScopes()}>
          {(scope) => (
            <DropdownCheck
              checked={!hiddenScopes().includes(scope)}
              onClick={(event) => toggleScope(scope, isSolo(event))}
            >
              {scope}
            </DropdownCheck>
          )}
        </For>
        <DropdownDivider />
        <div class="flex">
          <button type="button" class={DROPDOWN_ITEM} onClick={() => setAllScopesVisible(true)}>
            all
          </button>
          <button type="button" class={DROPDOWN_ITEM} onClick={() => setAllScopesVisible(false)}>
            none
          </button>
        </div>
        <DropdownHint>{TOOLBAR.soloHint}</DropdownHint>
      </Show>
    </Dropdown>
  );
}

function OptionsMenu() {
  return (
    <Dropdown label="⋯" title="console options" align="right">
      <DropdownCheck
        checked={keep()}
        title="keep logs when the game reloads"
        onClick={() => setKeep(!keep())}
      >
        keep on reload
      </DropdownCheck>
    </Dropdown>
  );
}

export default function ConsoleToolbar() {
  return (
    <div class="flex items-center gap-1.5 border-b border-outline bg-titlebar px-2 py-1 text-body text-fg">
      <For each={TOOLBAR.quickLevels}>{(level) => <QuickCounter level={level} />}</For>
      <LevelsMenu />
      <ScopesMenu />
      <input
        class="min-w-0 flex-1 rounded border border-divider bg-window px-1.5 text-fg outline-none"
        placeholder="search..."
        value={query()}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />
      <button type="button" class={TOOLBAR.button} onClick={clearConsole}>
        clear
      </button>
      <button type="button" class={TOOLBAR.button} onClick={dumpConsole}>
        dump
      </button>
      <OptionsMenu />
    </div>
  );
}
