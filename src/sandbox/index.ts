import Dogma from "@/core/dogma/dogma";
import Engine from "@engine/engine";
import EntitA from "./temp/entitA";
import EntityManager from "@/core/dogma/entityManager";
async function preload() {}
function setup() {
  const sec = Dogma.createScene("Sec", { priority: 1 });
  const main = Dogma.createScene("Main", { priority: 0 });

  main.addSystem("Rend");
  main.addSystem("Anim");

  // main.addSystem("Rend", { sprite: 1 });
  console.log(Dogma.getAllScenes());
}
Engine.initialize({ setup, preload });
