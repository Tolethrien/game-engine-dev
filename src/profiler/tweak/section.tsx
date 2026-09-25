import { Index, Match, Show, Switch } from "solid-js";
import type {
  TweakField,
  TweakFieldsSectionInfo,
  TweakListSectionInfo,
  TweakSectionInfo,
} from "@/core/debugger/modules/tweak/report";
import { useLocalStorage } from "../hooks/useLocalStorage";
import Control from "./controls";
import { tweakStore } from "./store";

export const HEADER_BUTTON =
  "cursor-pointer rounded border border-divider px-2 py-0.5 text-body text-fg-dim hover:text-fg";
const CARD_BUTTON =
  "cursor-pointer px-1 text-body text-fg-dim hover:text-fg disabled:cursor-default disabled:opacity-30 disabled:hover:text-fg-dim";
const SECTION_TOGGLE =
  "flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-body text-fg";

function FieldRow(props: {
  field: TweakField;
  value: unknown;
  onChange: (value: unknown) => void;
  onBegin: () => void;
  onEnd: () => void;
  onReset: () => void;
}) {
  return (
    <div class="flex items-center gap-2 text-body">
      <span
        class="w-28 shrink-0 cursor-pointer select-none truncate text-fg-dim hover:text-fg"
        title={`${props.field.key} (double click = reset to default)`}
        onDblClick={props.onReset}
      >
        {props.field.label ?? props.field.key}
      </span>
      <Show when={props.value !== undefined}>
        <Control
          control={props.field.control}
          value={props.value}
          onChange={props.onChange}
          onBegin={props.onBegin}
          onEnd={props.onEnd}
        />
      </Show>
    </div>
  );
}

function FieldsSection(props: {
  panelName: string;
  index: number;
  section: TweakFieldsSectionInfo;
}) {
  const [collapsed, setCollapsed] = useLocalStorage(
    `tweak:${props.panelName}:${props.index}`,
    false,
  );
  return (
    <div class="border-b border-divider">
      <button
        class={SECTION_TOGGLE + " w-full hover:bg-divider"}
        onClick={() => setCollapsed(!collapsed())}
      >
        <span class="w-3 text-fg-dim">{collapsed() ? "▸" : "▾"}</span>
        {props.section.title}
      </button>
      <Show when={!collapsed()}>
        <div class="flex flex-col gap-1.5 px-3 pb-2">
          <Index each={props.section.fields}>
            {(field) => (
              <FieldRow
                field={field()}
                value={tweakStore.values()[props.index]?.[field().key]}
                onChange={(value) =>
                  field().apply === "release"
                    ? tweakStore.stageValue(props.index, field().key, value)
                    : tweakStore.setValue(props.index, field().key, value)
                }
                onBegin={() => tweakStore.beginEdit(props.index, field().key)}
                onEnd={() => {
                  tweakStore.commitValue(props.index, field().key);
                  tweakStore.endEdit();
                }}
                onReset={() => tweakStore.resetField(props.index, field().key)}
              />
            )}
          </Index>
        </div>
      </Show>
    </div>
  );
}

function ListItem(props: {
  panelName: string;
  section: number;
  index: number;
  count: number;
  fields: TweakField[];
  label: string | null;
}) {
  const [collapsed, setCollapsed] = useLocalStorage(
    `tweak:${props.panelName}:${props.section}:${props.index}`,
    false,
  );
  const item = () => tweakStore.items(props.section)[props.index];
  return (
    <div class="rounded border border-divider">
      <div class="flex items-center pr-1">
        <button
          class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2 py-1 text-left text-body text-fg"
          onClick={() => setCollapsed(!collapsed())}
        >
          <span class="w-3 text-fg-dim">{collapsed() ? "▸" : "▾"}</span>
          <span class="truncate">{props.label ?? `#${props.index}`}</span>
        </button>
        <button
          class={CARD_BUTTON}
          title="Move up"
          disabled={props.index === 0}
          onClick={() => tweakStore.list.move(props.section, props.index, props.index - 1)}
        >
          ↑
        </button>
        <button
          class={CARD_BUTTON}
          title="Move down"
          disabled={props.index === props.count - 1}
          onClick={() => tweakStore.list.move(props.section, props.index, props.index + 1)}
        >
          ↓
        </button>
        <button
          class={CARD_BUTTON + " hover:text-error"}
          title="Remove"
          onClick={() => tweakStore.list.remove(props.section, props.index)}
        >
          ✕
        </button>
      </div>
      <Show when={!collapsed()}>
        <div class="flex flex-col gap-1.5 px-2 pb-2">
          <Index each={props.fields}>
            {(field) => (
              <FieldRow
                field={field()}
                value={item()?.[field().key]}
                onChange={(value) =>
                  field().apply === "release"
                    ? tweakStore.stageItemValue(props.section, props.index, field().key, value)
                    : tweakStore.setItemValue(props.section, props.index, field().key, value)
                }
                onBegin={() => tweakStore.beginItemEdit(props.section, props.index, field().key)}
                onEnd={() => {
                  tweakStore.commitItemValue(props.section, props.index, field().key);
                  tweakStore.endEdit();
                }}
                onReset={() => tweakStore.list.resetField(props.section, props.index, field().key)}
              />
            )}
          </Index>
        </div>
      </Show>
    </div>
  );
}

function ListSection(props: {
  panelName: string;
  index: number;
  section: TweakListSectionInfo;
}) {
  const [collapsed, setCollapsed] = useLocalStorage(
    `tweak:${props.panelName}:${props.index}`,
    false,
  );
  return (
    <div class="border-b border-divider">
      <div class="flex items-center gap-2 pr-3 hover:bg-divider">
        <button class={SECTION_TOGGLE} onClick={() => setCollapsed(!collapsed())}>
          <span class="w-3 text-fg-dim">{collapsed() ? "▸" : "▾"}</span>
          <span class="truncate">{props.section.title}</span>
          <span class="text-fg-dim">({props.section.itemFields.length})</span>
        </button>
        <button
          class={HEADER_BUTTON + " disabled:cursor-default disabled:opacity-30"}
          disabled={!props.section.addable}
          onClick={() => tweakStore.list.add(props.index)}
        >
          + add
        </button>
      </div>
      <Show when={!collapsed()}>
        <div class="flex flex-col gap-1 px-3 pb-2">
          <Index
            each={props.section.itemFields}
            fallback={<span class="text-caption text-fg-dim">Empty</span>}
          >
            {(fields, itemIndex) => (
              <ListItem
                panelName={props.panelName}
                section={props.index}
                index={itemIndex}
                count={props.section.itemFields.length}
                fields={fields()}
                label={props.section.itemLabels[itemIndex] ?? null}
              />
            )}
          </Index>
        </div>
      </Show>
    </div>
  );
}

export function Section(props: {
  panelName: string;
  index: number;
  section: TweakSectionInfo;
}) {
  return (
    <Switch>
      <Match when={props.section.arg === "list" && props.section}>
        {(section) => (
          <ListSection
            panelName={props.panelName}
            index={props.index}
            section={section() as TweakListSectionInfo}
          />
        )}
      </Match>
      <Match when={props.section.arg !== "list" && props.section}>
        {(section) => (
          <FieldsSection
            panelName={props.panelName}
            index={props.index}
            section={section() as TweakFieldsSectionInfo}
          />
        )}
      </Match>
    </Switch>
  );
}
