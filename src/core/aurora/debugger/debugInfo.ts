import Aurora from "../core";
import { AuroraConfig } from "../renderer/config";
import Renderer from "../renderer/renderer";
import appendDebugMenu from "./debugMenu";

export const TEXTURES_TO_SHOW = [
  "canvas",
  "offscreenCanvas",
  "zBufferDump",
  "lightMap",
  "bloomThreshold",
  "bloomEffect",
  "finalDraw",
  "PostLDR",
  "gui",
] as const;
type textures = (typeof TEXTURES_TO_SHOW)[number];
interface DebugData {
  fps: number;
  GPUTime: number;
  CPUTime: number;
  pipelineInUse: string[];
  displayedTexture: textures | (string & {});
  drawCalls: number;
  computeCalls: number;
  totalCalls: number;
  renderPasses: number;
  computePasses: number;
  drawnQuads: number;
  drawnGui: number;
  drawnLights: number;
  drawnTriangles: number;
  drawnVertices: number;
  globalIllumination: RGB;
  usedPostProcessing: string[];
  sortOrder: AuroraConfig["rendering"]["sortOrder"];
  drawOrigin: AuroraConfig["rendering"]["drawOrigin"];
  pipelineTimes: { name: string; time: number }[];
}
const DATA_INIT: DebugData = {
  fps: 0,
  GPUTime: 0,
  CPUTime: 0,
  pipelineInUse: [],
  //   pipelineTimes: [],
  displayedTexture: "canvas",
  drawCalls: 0,
  computeCalls: 0,
  totalCalls: 0,
  renderPasses: 0,
  computePasses: 0,
  drawnQuads: 0,
  drawnGui: 0,
  drawnLights: 0,
  drawnTriangles: 0,
  drawnVertices: 0,
  globalIllumination: [0, 0, 0],
  usedPostProcessing: [],
  sortOrder: "none",
  drawOrigin: "center",
  pipelineTimes: [],
};
const TO_CLEAR: (keyof DebugData)[] = [
  "computeCalls",
  "computePasses",
  "drawCalls",
  "drawnGui",
  "drawnLights",
  "drawnQuads",
  "pipelineInUse",
  "pipelineTimes",
  "renderPasses",
  "usedPostProcessing",
];
enum TIMESTAMPS {
  totalStart,
  totalEnd,
  drawEnd, //drawStart is totalStart
  bloomStart,
  bloomEnd,
  colorCorStart,
  colorCorEnd,
  postLDRStart,
  postLDREnd,
  lightsStart,
  lightsEnd,
  guiStart,
  guiEnd,
  screenStart, // screenEnd is totalEnd
}
const TIMING_DEPENDENCIES = {
  gpu: { start: TIMESTAMPS["totalStart"], end: TIMESTAMPS["totalEnd"] },
  draw: { start: TIMESTAMPS["totalStart"], end: TIMESTAMPS["drawEnd"] },
  lights: { start: TIMESTAMPS["lightsStart"], end: TIMESTAMPS["lightsEnd"] },
  bloom: { start: TIMESTAMPS["bloomStart"], end: TIMESTAMPS["bloomEnd"] },
  colorCorrection: {
    start: TIMESTAMPS["colorCorStart"],
    end: TIMESTAMPS["colorCorEnd"],
  },
  postProcessLDR: {
    start: TIMESTAMPS["postLDRStart"],
    end: TIMESTAMPS["postLDREnd"],
  },
  gui: { start: TIMESTAMPS["guiStart"], end: TIMESTAMPS["guiEnd"] },
  screen: { start: TIMESTAMPS["screenStart"], end: TIMESTAMPS["totalEnd"] },
};
export default class AuroraDebugInfo {
  private static isGathering = false;
  private static data: DebugData = structuredClone(DATA_INIT);
  private static query: GPUQuerySet;
  private static writeBuffer: GPUBuffer;
  private static readBuffer: GPUBuffer;
  private static lastFrameTime = 0;
  private static frameTimeStart = 0;
  private static menuVisible = false;
  public static debugVisibleTextureIndex = new Uint32Array([0]);
  private static spritesStress: [number, number][] = [];
  private static timeAccumulator = {
    main: 0,
    pipes: 0,
  };
  public static get isWorking() {
    return this.isGathering;
  }
  public static setWorking(val: boolean) {
    this.isGathering = val;
    this.query = Aurora.createQuerySet({
      type: "timestamp",
      count: Object.keys(TIMESTAMPS).length / 2,
    });

    this.writeBuffer = Aurora.createQueryBuffer({
      count: Object.keys(TIMESTAMPS).length / 2,
      mode: "write",
    });
    this.readBuffer = Aurora.createQueryBuffer({
      count: Object.keys(TIMESTAMPS).length / 2,
      mode: "read",
    });
    document.addEventListener("keypress", (e) => {
      if (e.key === "`") this.setMenuVisible(this.menuVisible);
    });

    //TODO: this is temporary for debugging, in engine will be change to proper tools
    appendDebugMenu();
  }
  public static setSpriteStressTest(numberOfSprites: number) {
    const res = Renderer.getCurrentResolution();
    this.spritesStress = Array(numberOfSprites * 100)
      .fill(0)
      .map(() => [Math.random() * res.width, Math.random() * res.height]);
  }
  public static getStressTestSprites() {
    return this.spritesStress;
  }
  public static setParam<T extends keyof DebugData>(
    data: T,
    value: DebugData[T]
  ) {
    if (!this.isGathering) return;
    this.data[data] = value;
  }
  public static accumulate<T extends keyof DebugData>(
    data: T,
    value: DebugData[T]
  ) {
    if (!this.isGathering) return;

    const last = this.data[data];

    if (typeof last === "string")
      console.warn(`you cannot accumulate string value for ${data}`);
    else if (typeof last === "number" && typeof value === "number")
      this.data[data] = (last + value) as DebugData[T];
    else if (typeof last === "object" && typeof value === "object")
      this.data[data] = [...last, ...value] as DebugData[T];
  }
  public static get getAllData() {
    return this.data;
  }

  public static get getVisibleTexture() {
    return this.debugVisibleTextureIndex;
  }
  public static getSpecific<T extends keyof DebugData>(data: T) {
    return this.data[data];
  }
  public static clearData() {
    //this is async so need to be copied frame to frame
    const lastTImes = this.data.pipelineTimes;
    TO_CLEAR.forEach((option) => {
      const value = this.data[option];
      //drawCalls is number so will shout up ts
      if (typeof value === "number")
        (this.data[option] as DebugData["drawCalls"]) = 0;
      //same here, pipelineTimes are always []
      else if (Array.isArray(value))
        (this.data[option] as DebugData["pipelineTimes"]) = [];
    });
    this.data.pipelineTimes = lastTImes;
  }
  public static displayEveryFrame(seconds: number, clear: boolean = false) {
    if (!this.shouldTrigger("main", seconds)) return;
    if (clear) console.clear();
    console.group("Debug Data");
    console.log(
      "adapter:",
      `${Aurora.device.adapterInfo.vendor}:${Aurora.device.adapterInfo.architecture}`
    );
    console.log("FPS:", this.data.fps);
    if (this.isGathering) {
      console.log("CPU Time:", `${this.data.CPUTime} ms`);
      console.log("GPU Time:", `${this.data.GPUTime} ms`);
      for (const [name, val] of Object.entries(this.data)) {
        if (
          name === "fps" ||
          name === "GPUTime" ||
          name === "CPUTime" ||
          name === "pipelineTimes"
        )
          continue;
        console.log(`${name}:`, val);
      }
    }

    console.groupEnd();
  }
  public static displayPipelinesTime(seconds: number, clear = false) {
    if (!this.shouldTrigger("pipes", seconds)) return;
    if (clear) console.clear();

    console.group("Pipelines times");
    console.table(this.data.pipelineTimes);
    console.groupEnd();
  }
  public static setTimestamp(
    begin?: keyof typeof TIMESTAMPS,
    end?: keyof typeof TIMESTAMPS
  ): GPURenderPassTimestampWrites | undefined {
    if (!this.isWorking) return;
    const beginBufferIndex = begin ? TIMESTAMPS[begin] : undefined;
    const endBufferIndex = end ? TIMESTAMPS[end] : undefined;
    return {
      querySet: this.query,
      beginningOfPassWriteIndex: beginBufferIndex,
      endOfPassWriteIndex: endBufferIndex,
    };
  }
  public static updateTimes(times: BigInt64Array) {
    this.data.pipelineTimes = [];
    const gpuTime = this.getTimeFrom(times[1], times[0]);
    this.setParam("GPUTime", gpuTime);
    Object.entries(TIMING_DEPENDENCIES).forEach((entry) => {
      const name = entry[0];
      const indexes = entry[1];
      const time = this.getTimeFrom(times[indexes.end], times[indexes.start]);
      this.accumulate("pipelineTimes", [{ name, time }]);
    });
  }
  private static getTimeFrom(start: BigInt, end: BigInt) {
    const newA = Number(start);
    const newB = Number(end);
    const timeToNumber = newA - newB;
    return Number((timeToNumber / 1000 / 1000).toFixed(1));
  }
  public static getQuery() {
    return {
      qSet: this.query,
      qWrite: this.writeBuffer,
      qRead: this.readBuffer,
      count: Object.keys(TIMESTAMPS).length / 2,
    };
  }
  public static startCount(timestamp: number) {
    if (this.isGathering) this.clearData();
    timestamp *= 0.001;
    const deltaTime = timestamp - this.lastFrameTime;
    this.data["fps"] = Number((1 / deltaTime).toFixed(1));
    this.lastFrameTime = timestamp;
    this.frameTimeStart = performance.now();
    this.timeAccumulator.main += deltaTime;
    this.timeAccumulator.pipes += deltaTime;
  }
  public static endCount() {
    if (!this.isGathering) return;
    const time = performance.now() - this.frameTimeStart;
    this.data["CPUTime"] = Number(time.toFixed(1));
  }
  private static shouldTrigger(
    what: keyof typeof this.timeAccumulator,
    seconds: number
  ): boolean {
    if (this.timeAccumulator[what] >= seconds) {
      this.timeAccumulator[what] -= seconds;
      return true;
    }
    return false;
  }
  public static setMenuVisible(isVisible: boolean) {
    const menu = document.getElementById("debugMenu");
    if (!menu) {
      console.warn(
        "trying to set visibility of a debug menu, but menu is not append to body.\nMake sure you turn on debugger in auroraConfig"
      );
      return;
    }
    menu.style.display = isVisible ? "flex" : "none";
    this.menuVisible = !this.menuVisible;
  }
}
