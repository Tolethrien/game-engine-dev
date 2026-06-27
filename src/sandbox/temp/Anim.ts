import Dogma from "@/core/dogma/dogma";
import EntityManager from "@/core/dogma/entityManager";
import System, { InternalDSProps } from "@/core/dogma/system";
import EntitA from "./entitA";
import DogmaEntity from "@/core/dogma/entity";

export default class Anim extends System {
  declare private test: DogmaEntity;
  constructor(internal: InternalDSProps) {
    super(internal);
  }
  public onStart(): void {
    console.log("system added");
    // this.subscribeToPhase("update", () => this.sendMsg());
    this.subscribeToPhase({
      phase: "update",
      callback: this.sendMsg.bind(this),
      before: ["Rend"],
    });
    // this.unSubscribeFromPhase("update");
    const ent = new EntitA();
    this.test = ent;
    ent.setMarker("Player");
    ent.addTag("human");
    EntityManager.spawnEntity(ent, "Main");
    window.addEventListener("keypress", (e) => {
      if (e.key === "l") {
        // const ent = new EntitA();
        // ent.addTag("human");
        // EntityManager.spawnEntity(ent, "Main");
        this.addEntityTag(ent.getComponents().get("Move")!, "warrior");
        // ent.addTag("warrior");
        // this.notifyEntityTagChange(ent.ID, ent.tags);
        // EntityManager.removeEntity(ent.ID, "Main");
        // console.log(Dogma.getAllScenes());
      }
    });
    window.addEventListener("keypress", (e) => {
      if (e.key === "k") {
        this.removeEntityTag(ent.getComponents().get("Move")!, "warrior");

        // EntityManager.removeEntity(ent.ID, "Main");
        // ent.addTag("warrior");
        // this.notifyEntityTagChange(ent.ID, ent.tags);
        // EntityManager.removeEntity(ent.ID, "Main");
        // console.log(Dogma.getAllScenes());
      }
    });
    // this.subscribeToPhase("preUpdate", () => this.sendMsgPre());
    // this.subscribeToPhase("fixedUpdate", () => this.sendMsgF());
    // this.setActive(false);
  }
  public onDestroy(): void {
    console.log("system removed");
  }
  public sendMsg() {
    const query = this.query(["Move", "Trans"]);
    const tags = this.getComponentsWithTags("Move", ["human", "warrior"]);
    // console.log(tags);
    console.log(tags);
    // console.log(this.test.tags);
  }
  public sendMsgPre() {
    console.log("pre", this.test);
  }
  public sendMsgF() {
    console.log("fixed", this.test);
  }
}
