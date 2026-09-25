import { For, Index, Show, createSignal } from "solid-js";
import Dropdown, { DROPDOWN_ITEM, DropdownHint } from "../blocks/dropdown";
import type { TweakPanelInfo } from "@/core/debugger/modules/tweak/report";
import { HEADER_BUTTON, Section } from "./section";
import { tweakStore } from "./store";

export function ExportBlock(props: { text: string }) {
  return (
    <div class="border-b border-divider bg-window p-2">
      <div class="mb-1 flex justify-end gap-2">
        <button
          class={HEADER_BUTTON}
          onClick={() => navigator.clipboard.writeText(props.text)}
        >
          Copy
        </button>
        <button class={HEADER_BUTTON} title="Hide" onClick={tweakStore.hideExport}>
          ✕
        </button>
      </div>
      <pre class="max-h-48 select-text overflow-auto whitespace-pre font-mono text-caption text-fg">
        {props.text}
      </pre>
    </div>
  );
}

function PresetBar() {
  const [presetName, setPresetName] = createSignal("");
  const save = () => {
    tweakStore.savePreset(presetName());
    setPresetName("");
  };
  return (
    <div class="flex items-center gap-2 border-b border-divider px-3 py-1.5">
      <input
        class="min-w-0 flex-1 rounded border border-divider bg-window px-1 text-body text-fg outline-none focus:border-outline"
        placeholder="Preset name"
        value={presetName()}
        onInput={(event) => setPresetName(event.currentTarget.value)}
        onKeyDown={(event) => event.key === "Enter" && save()}
      />
      <button class={HEADER_BUTTON} onClick={save}>
        Save
      </button>
      <Dropdown label="Load" align="right">
        <Show
          when={tweakStore.presetNames().length > 0}
          fallback={<DropdownHint>No saved presets</DropdownHint>}
        >
          <For each={tweakStore.presetNames()}>
            {(name) => (
              <div class="flex items-center hover:bg-divider">
                <button
                  class={DROPDOWN_ITEM + " flex-1"}
                  onClick={() => tweakStore.loadPreset(name)}
                >
                  {name}
                </button>
                <button
                  class="cursor-pointer px-2 text-fg-dim hover:text-error"
                  title="Delete"
                  onClick={() => tweakStore.deletePreset(name)}
                >
                  ✕
                </button>
              </div>
            )}
          </For>
        </Show>
      </Dropdown>
    </div>
  );
}

export function PanelBody(props: { panel: () => TweakPanelInfo; onClose?: () => void }) {
  return (
    <>
      <header class="flex items-center gap-2 border-b border-divider px-3 py-1.5">
        <span class="flex-1 truncate text-value text-fg">{props.panel().title}</span>
        <Show when={props.panel().presets}>
          <button class={HEADER_BUTTON} onClick={tweakStore.revert}>
            Revert
          </button>
        </Show>
        <Show when={props.panel().exportable}>
          <button
            class={HEADER_BUTTON}
            title="Every setting"
            onClick={() => tweakStore.requestExport(false)}
          >
            Export all
          </button>
          <button
            class={HEADER_BUTTON}
            title="Only settings that differ from the defaults"
            onClick={() => tweakStore.requestExport(true)}
          >
            Export changed
          </button>
        </Show>
        <Show when={props.onClose}>
          <button class={HEADER_BUTTON} title="Close" onClick={props.onClose}>
            ✕
          </button>
        </Show>
      </header>
      <Show when={props.panel().presets}>
        <PresetBar />
      </Show>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <Show when={tweakStore.exported()}>
          {(text) => <ExportBlock text={text()} />}
        </Show>
        <Index each={props.panel().sections}>
          {(section, index) => (
            <Section panelName={props.panel().name} index={index} section={section()} />
          )}
        </Index>
      </div>
    </>
  );
}

function PanelView(props: { panel: () => TweakPanelInfo }) {
  return (
    <aside class="absolute bottom-0 right-0 top-titlebar flex w-96 max-w-full flex-col border-l border-outline bg-panel shadow-lg">
      <PanelBody panel={props.panel} onClose={tweakStore.close} />
    </aside>
  );
}

export default function TweakModal() {
  return (
    // keyed by name: another panel remounts, so the per-panel local storage keys are read again
    <Show when={tweakStore.panel()?.group === null ? tweakStore.name() : null} keyed>
      {(_name) => (
        <div class="pointer-events-none fixed inset-0 z-40">
          <div class="pointer-events-auto">
            <PanelView panel={() => tweakStore.panel()!} />
          </div>
        </div>
      )}
    </Show>
  );
}
