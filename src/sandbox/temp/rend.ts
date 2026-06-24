import System, { InternalDSProps } from "@/core/dogma/system";

export default class Rend extends System {
  constructor(internal: InternalDSProps, obj: { sprite: number }) {
    super(internal);
  }
  public onStart(): void {
    this.subscribeToPhase({
      phase: "update",
      callback: () => this.sendMsg(),
    });
  }
  public sendMsg() {
    console.log("rend msg");
  }
}
