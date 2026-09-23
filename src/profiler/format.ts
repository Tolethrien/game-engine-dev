export const formatCount = (value?: number) => value?.toLocaleString() ?? "—";

export const formatMs = (value?: number, digits = 2) =>
  value?.toFixed(digits) ?? "—";

export const formatBytes = (bytes?: number) => {
  if (bytes === undefined) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};
