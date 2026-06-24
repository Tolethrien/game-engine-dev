import System, { InternalDSProps } from "@/core/dogma/system";

export default class Anim extends System {
  private test = 1;
  constructor(internal: InternalDSProps, obj: { frame: number }) {
    super(internal);
  }
  public onStart(): void {
    console.log("system added");
    // this.subscribeToPhase("update", () => this.sendMsg());
    this.subscribeToPhase({
      phase: "update",
      callback: () => this.sendMsg(),
      before: ["Rend"],
    });
    // this.subscribeToPhase("preUpdate", () => this.sendMsgPre());
    // this.subscribeToPhase("fixedUpdate", () => this.sendMsgF());
    // this.setActive(false);
  }
  public onDestroy(): void {
    console.log("system removed");
  }
  public sendMsg() {
    console.log("animMSg");
  }
  public sendMsgPre() {
    console.log("pre", this.test);
  }
  public sendMsgF() {
    console.log("fixed", this.test);
  }
}
