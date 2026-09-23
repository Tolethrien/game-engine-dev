import FontCanvas from "./fontCanvas";

export default class KerningTable {
  public static readonly referenceSize = 100;

  private readonly font: string;
  // nested by code keeps every key a small integer, a combined key would box a double on each lookup
  private readonly pairs: Map<number, Map<number, number>> = new Map();

  constructor(name: string) {
    this.font = FontCanvas.font(name, KerningTable.referenceSize);
  }

  public get(left: number, right: number) {
    let row = this.pairs.get(left);
    if (!row) this.pairs.set(left, (row = new Map()));
    let value = row.get(right);
    if (value === undefined) {
      value = this.measure(left, right);
      row.set(right, value);
    }
    return value;
  }

  // a ligature forms in both measurements and cancels out, unlike width(ab) - width(a) - width(b)
  private measure(left: number, right: number) {
    const pair = String.fromCodePoint(left, right);
    const kerned = FontCanvas.scratch(this.font, 1, 1, "normal").measureText(
      pair,
    ).width;
    const plain = FontCanvas.scratch(this.font, 1, 1, "none").measureText(
      pair,
    ).width;
    return kerned - plain;
  }
}
