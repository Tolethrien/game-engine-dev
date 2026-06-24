export function assert(condition: boolean, msg?: string): asserts condition {
  if (!condition) throw new Error(msg ?? "Assertion Failed");
}
export function createUUID() {
  return crypto.randomUUID();
}
