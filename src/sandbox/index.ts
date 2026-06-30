import Dogma from "@/core/dogma/dogma";
import Engine from "@engine/engine";
import Player from "./entities/player";
import EntityManager from "@/core/dogma/entityManager";
import Wall from "./entities/wall";
async function preload() {}
function setup() {
  const main = Dogma.createScene("Main");
  main.addSystem("Inputs");
  main.addSystem("Physics");
  main.addSystem("Render");
  const player = new Player();
  const wall = new Wall();
  EntityManager.spawnEntity(player, "Main");
  EntityManager.spawnEntity(wall, "Main");
}
Engine.initialize({ setup, preload });
