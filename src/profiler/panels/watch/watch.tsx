import { For, Show, createEffect, createMemo, createSignal, on } from "solid-js";
import {
  childrenOf,
  formatPreview,
  formatTime,
  hasDetails,
  sourceLines,
} from "@/core/debugger/modules/log/format";
import type { SerializedValue } from "@/core/debugger/modules/log/report";
import type { WatchSnapshot } from "@/core/debugger/modules/watch/report";
import { formatPath, isIdentifier } from "@/core/debugger/modules/command/parse";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { ctrlHeld } from "../../hooks/useModifier";
import { commandRegistry } from "../../console/command/registry";
import { insertCommandText } from "../../console/store";
import { childPathState, rootPathState, type PathState } from "./commandPath";
import { watchStore } from "../../watch/store";
import { watchLocks } from "../../console/command/locks";
import LockIcon from "../../blocks/lockIcon";
import ValuePreview, { labelClass } from "../../blocks/valuePreview";

const WATCH_VIEW = {
  previewLength: 200,
  rowHeight: 18,
  depthIndent: 12,
  flashMs: 600,
  flashAlpha: "25%",
};

interface WatchRow {
  depth: number;
  label: string;
  preview: string;
  // null for function code lines, drawn as plain text
  value: SerializedValue | null;
  expandable: boolean;
  code: boolean;
  command: PathState | null;
}

interface FlatTree {
  // rows keyed by path, so For keeps each row's DOM while its value changes
  paths: string[];
  rows: Map<string, WatchRow>;
}

function flatten(
  root: SerializedValue,
  expanded: ReadonlySet<string>,
  rootState: PathState,
): FlatTree {
  const tree: FlatTree = { paths: [], rows: new Map() };
  const push = (path: string, row: WatchRow) => {
    tree.paths.push(path);
    tree.rows.set(path, row);
  };
  const walk = (value: SerializedValue, parent: string, depth: number, state: PathState) => {
    sourceLines(value).forEach((line, index) =>
      push(`${parent}:c${index}`, {
        depth,
        label: "",
        preview: line,
        value: null,
        expandable: false,
        code: true,
        command: null,
      }),
    );
    for (const [label, child] of childrenOf(value)) {
      const path = parent === "" ? label : `${parent}/${label}`;
      const expandable = hasDetails(child);
      const command = childPathState(value, state, label, child);
      push(path, {
        depth,
        label,
        preview: formatPreview(child, WATCH_VIEW.previewLength),
        value: child,
        expandable,
        code: false,
        command,
      });
      if (expandable && expanded.has(path)) walk(child, path, depth + 1, command);
    }
  };
  walk(root, "", 0, rootState);
  return tree;
}

function flash(element: HTMLElement, previous: Animation | undefined) {
  previous?.cancel();
  const live = getComputedStyle(element).getPropertyValue("--color-live");
  return element.animate(
    [
      {
        backgroundColor: `color-mix(in srgb, ${live} ${WATCH_VIEW.flashAlpha}, transparent)`,
      },
      { backgroundColor: "transparent" },
    ],
    { duration: WATCH_VIEW.flashMs, easing: "ease-out" },
  );
}

function TreeRow(props: {
  row: () => WatchRow | undefined;
  expanded: boolean;
  error: boolean;
  flash: boolean;
  // why rows cannot insert a path, empty when they can
  blocked: string;
  onToggle: () => void;
}) {
  let element: HTMLDivElement | undefined;
  let animation: Animation | undefined;
  const preview = () => props.row()?.preview;
  const commandText = (row: WatchRow) =>
    row.command?.path ? formatPath(row.command.path) : null;
  const insertable = (row: WatchRow) => commandText(row) !== null;

  // first run gets previous = undefined, so mounting or expanding a parent never flashes;
  // no `defer`: a deferred run does not record the input, the first real change would be lost
  createEffect(
    on(preview, (next, previous) => {
      if (!props.flash || !element) return;
      if (previous !== undefined && next !== undefined && next !== previous)
        animation = flash(element, animation);
    }),
  );

  return (
    <Show when={props.row()}>
      {(row) => (
        <div
          ref={element}
          class="flex shrink-0 items-center gap-1 whitespace-nowrap hover:bg-titlebar"
          classList={{
            "cursor-pointer": row().expandable || (ctrlHeld() && insertable(row())),
          }}
          title={
            ctrlHeld() && insertable(row())
              ? "Ctrl+click: insert path"
              : ctrlHeld() && props.blocked
                ? props.blocked
                : undefined
          }
          style={{
            height: `${WATCH_VIEW.rowHeight}px`,
            "padding-left": `${row().depth * WATCH_VIEW.depthIndent}px`,
          }}
          onClick={(event) => {
            const text = event.ctrlKey ? commandText(row()) : null;
            if (text) insertCommandText(text);
            else if (!event.ctrlKey && row().expandable) props.onToggle();
          }}
        >
          <span class="w-3 shrink-0 text-fg-dim">
            {row().expandable ? (props.expanded ? "▾" : "▸") : ""}
          </span>
          <Show when={row().label !== ""}>
            <span
              class={`shrink-0 ${labelClass(row().label)}`}
              classList={{ underline: ctrlHeld() && insertable(row()) }}
            >
              {row().label}
              <span class="text-syntax-punct">: </span>
            </span>
          </Show>
          <span
            class="min-w-0 truncate"
            classList={{
              "whitespace-pre text-fg-dim": row().code,
              "text-error": props.error && !row().code,
              "text-fg": !props.error && !row().code,
            }}
            title={row().preview}
          >
            <Show when={row().value} fallback={row().preview}>
              {(value) => (
                <ValuePreview
                  value={value()}
                  maxLength={WATCH_VIEW.previewLength}
                  plain={props.error}
                />
              )}
            </Show>
          </span>
        </div>
      )}
    </Show>
  );
}

function SnapshotView(props: {
  name: string;
  snapshot: WatchSnapshot;
  expanded: ReadonlySet<string>;
  flash: boolean;
  onToggle: (path: string) => void;
}) {
  // a name that cannot be typed, or one a command shadows, cannot be addressed
  const blocked = createMemo(() => {
    if (!isIdentifier(props.name)) return "the watch name is not a valid identifier";
    if (commandRegistry.find(props.name))
      return `a command named "${props.name}" shadows this watch`;
    return "";
  });
  const tree = createMemo(() =>
    flatten(
      props.snapshot.value,
      props.expanded,
      rootPathState(blocked() ? null : [props.name]),
    ),
  );

  return (
    <Show
      when={hasDetails(props.snapshot.value)}
      fallback={
        <span
          class="truncate"
          classList={{
            "text-error": props.snapshot.error,
            "text-fg": !props.snapshot.error,
            "cursor-pointer underline": ctrlHeld() && !blocked(),
          }}
          title={
            ctrlHeld() ? (blocked() || "Ctrl+click: insert path") : undefined
          }
          onClick={(event) => {
            if (event.ctrlKey && !blocked()) insertCommandText(props.name);
          }}
        >
          <ValuePreview
            value={props.snapshot.value}
            maxLength={WATCH_VIEW.previewLength}
            plain={props.snapshot.error}
          />
        </span>
      }
    >
      <For each={tree().paths}>
        {(path) => (
          <TreeRow
            row={() => tree().rows.get(path)}
            expanded={props.expanded.has(path)}
            error={props.snapshot.error}
            flash={props.flash}
            blocked={blocked()}
            onToggle={() => props.onToggle(path)}
          />
        )}
      </For>
    </Show>
  );
}

export default function WatchPanel(props: { name: string }) {
  const [frozen, setFrozen] = createSignal(false);
  const [held, setHeld] = createSignal<WatchSnapshot | null>(null);
  const [storedExpanded, setStoredExpanded] = useLocalStorage<string[]>(
    `watch:expanded:${props.name}`,
    [],
  );
  const [flashing, setFlashing] = useLocalStorage<boolean>(
    `watch:flash:${props.name}`,
    true,
  );
  const expanded = createMemo(() => new Set(storedExpanded()));
  // a frozen panel drops out of the visible set, so the game stops calling its getter
  watchStore.trackVisible(props.name, () => !frozen());

  const snapshot = () => (frozen() ? held() : watchStore.snapshot(props.name));
  const readOnly = () => watchStore.info(props.name)?.editable === false;
  const locked = () => readOnly() || watchLocks.isLocked(props.name);

  function toggleFrozen() {
    if (!frozen()) setHeld(watchStore.snapshot(props.name));
    setFrozen(!frozen());
  }

  function toggleExpanded(path: string) {
    setStoredExpanded((previous) =>
      previous.includes(path)
        ? previous.filter((item) => item !== path)
        : [...previous, path],
    );
  }

  return (
    <div class="flex h-full min-h-0 flex-col gap-1">
      <div class="flex shrink-0 items-center gap-2 text-fg-dim">
        <Show when={snapshot()} fallback={<span class="italic">no value yet</span>}>
          {(current) => (
            <span class="tabular-nums">
              f{current().frame} · {formatTime(current().time)}
            </span>
          )}
        </Show>
        <button
          class="ml-auto cursor-pointer rounded bg-divider px-1.5 hover:text-fg data-[active]:text-live"
          data-active={flashing() ? "" : undefined}
          aria-pressed={flashing()}
          aria-label="Flash changed rows"
          onClick={() => setFlashing(!flashing())}
        >
          flash
        </button>
        <button
          class="flex cursor-pointer items-center rounded bg-divider px-1.5 py-0.5 hover:text-fg disabled:cursor-default disabled:opacity-60 data-[active]:text-warn"
          data-active={locked() ? "" : undefined}
          aria-pressed={locked()}
          disabled={readOnly()}
          title={
            readOnly()
              ? "read-only in game code"
              : locked()
                ? "console commands cannot change this watch"
                : "lock against console commands"
          }
          onClick={() => watchLocks.toggle(props.name)}
        >
          <LockIcon closed={locked()} />
        </button>
        <button
          class="cursor-pointer rounded bg-divider px-1.5 hover:text-fg data-[active]:text-live"
          data-active={frozen() ? "" : undefined}
          aria-pressed={frozen()}
          onClick={toggleFrozen}
        >
          {frozen() ? "frozen" : "freeze"}
        </button>
      </div>
      <div class="flex min-h-0 flex-1 flex-col overflow-auto">
        <Show when={snapshot()}>
          {(current) => (
            <SnapshotView
              name={props.name}
              snapshot={current()}
              expanded={expanded()}
              flash={flashing()}
              onToggle={toggleExpanded}
            />
          )}
        </Show>
      </div>
    </div>
  );
}
