import Dogma from "@/core/dogma/dogma";
import Engine from "@engine/engine";
import EntitA from "./temp/entitA";
import EntityManager from "@/core/dogma/entityManager";
async function preload() {}
function setup() {
  const sec = Dogma.createScene("Sec", { priority: 1 });
  const main = Dogma.createScene("Main", { priority: 0 });
  // const ent = new EntitA();
  // EntityManager.spawnEntity(ent, "Main");
  main.addSystem("Rend");
  main.addSystem("Anim");
  window.addEventListener("keypress", (e) => {
    if (e.key === "l") {
      main.removeSystem("Anim");
      // Dogma.createScene("sce", { priority: 0 });
      console.log(Dogma.getAllScenes());
    }
  });
  // main.addSystem("Rend", { sprite: 1 });
  console.log(Dogma.getAllScenes());
}
Engine.initialize({ setup, preload });
