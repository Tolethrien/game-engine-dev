export default class AxiomUtils {
  static randomUUID() {
    return crypto.randomUUID();
  }
  static assert(condition: boolean, msg?: string): asserts condition {
    if (!condition) throw new Error(msg ?? "Assertion Failed");
  }
}
