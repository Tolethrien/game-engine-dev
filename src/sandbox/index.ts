import Dogma from "@/core/dogma/dogma";
import Engine from "@/core/engine/engine";
import Pragma from "@/core/pragma/pragma";
import Player from "./pragma/player";
async function preload() {}
function setup() {
  const world = Pragma.addScene("main");
  console.log(world);
  const a = new Player();
  world.spawnActor(a);
  Pragma.update();
  const b = a.getComponent("Sraka");
}
Engine.initialize({ setup, preload });
