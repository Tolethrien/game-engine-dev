import System, { InternalDSProps } from "@/core/dogma/system";

export default class Anim extends System {
  declare private test: Set<Symbol>;
  constructor(internal: InternalDSProps) {
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
    this.unSubscribeFromPhase("update");
    const msg = this.query(["Move", "Trans"]);
    this.test = msg;
    // this.subscribeToPhase("preUpdate", () => this.sendMsgPre());
    // this.subscribeToPhase("fixedUpdate", () => this.sendMsgF());
    // this.setActive(false);
  }
  public onDestroy(): void {
    console.log("system removed");
  }
  public sendMsg() {
    // console.log(this.test);
    // console.log(this.getComponentList("Move"));
  }
  public sendMsgPre() {
    console.log("pre", this.test);
  }
  public sendMsgF() {
    console.log("fixed", this.test);
  }
}
