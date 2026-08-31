export enum Units {
  px,
  pw,
  ph,
  auto,
}
export type Unit = { value: number; unit: Units };
export type UnitPosition2D = { x: Unit; y: Unit };
export type UnitSize2D = { width: Unit; height: Unit };
export function px(value: number): Unit {
  return { value, unit: Units.px };
}
export function pw(value: number): Unit {
  return { value, unit: Units.pw };
}
export function ph(value: number): Unit {
  return { value, unit: Units.ph };
}

export function toPx(
  { unit, value }: Unit,
  parentW: number,
  parentH: number,
  scale: number,
) {
  switch (unit) {
    case Units.px:
      return value * scale;
    case Units.pw:
      return value * (parentW / 100);
    case Units.ph:
      return value * (parentH / 100);
    default:
      return 0;
  }
}
export function auto(): Unit {
  return { value: 0, unit: Units.auto };
}
