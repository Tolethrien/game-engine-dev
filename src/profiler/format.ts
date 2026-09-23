export const formatCount = (value?: number) => value?.toLocaleString() ?? "—";

export const formatMs = (value?: number, digits = 2) =>
  value?.toFixed(digits) ?? "—";
