import { For, createMemo } from "solid-js";
import {
  previewTokens,
  type SyntaxKind,
} from "@/core/debugger/modules/log/format";
import type { SerializedValue } from "@/core/debugger/modules/log/report";

const SYNTAX_CLASS: Record<SyntaxKind, string> = {
  key: "text-syntax-key",
  string: "text-syntax-string",
  number: "text-syntax-number",
  keyword: "text-syntax-keyword",
  nullish: "text-syntax-nullish",
  type: "text-syntax-type",
  function: "text-syntax-function",
  punct: "text-syntax-punct",
  plain: "",
};

export function labelClass(label: string) {
  return /^\d+$/.test(label) || label.startsWith("[[") || label === "…"
    ? SYNTAX_CLASS.punct
    : SYNTAX_CLASS.key;
}

export default function ValuePreview(props: {
  value: SerializedValue;
  maxLength: number;
  plain?: boolean;
}) {
  const tokens = createMemo(() => previewTokens(props.value, props.maxLength));
  return (
    <For each={tokens()}>
      {(token) => (
        <span class={props.plain ? "" : SYNTAX_CLASS[token.kind]}>
          {token.text}
        </span>
      )}
    </For>
  );
}
