interface Sound {
  name: string;
  url: string;
}
export interface CategoryTree {
  initVol: number;
  children?: Record<string, CategoryTree>;
}
type EffectScope = "shared" | "perInstance";
interface EffectStrategy {
  scope: EffectScope;
  build: (ctx: AudioContext, runtimeArgs?: unknown) => EffectNode;
}
interface EffectNode {
  input: AudioNode;
  output: AudioNode;
}
interface CelloConfig {
  masterVolume: number;
  preloadSounds?: Sound[];
  categoryTree?: Record<string, CategoryTree>;
  effects?: Record<string, EffectStrategy>;
}
interface PlayObject {
  loop?: boolean;
  effects?: string[];
  volume?: number;
  randomPitch?: number; //0-1 - 0.1 small diff
  position?: Position2D;
  maxConcurrent?: number;
  categories: string[];
}
type NodeTypeMap = {
  gain: GainNode;
  delay: DelayNode;
  filter: BiquadFilterNode;
  stereoPan: StereoPannerNode;
  convolver: ConvolverNode;
  compressor: DynamicsCompressorNode;
  waveShaper: WaveShaperNode;
  analyser: AnalyserNode;
  panner: PannerNode;
};
export default class Cello {
  private static buffers: Map<string, AudioBuffer> = new Map();
  private static categories: Map<string, GainNode> = new Map();
  private static categoryParents: Map<string, string> = new Map();
  private static effectRegistry: Map<string, EffectStrategy> = new Map();
  private static sharedEffects: Map<string, EffectNode> = new Map();
  private static activeCounts: Map<string, number> = new Map();
  // private static lastPlayedAt: Map<string, number> = new Map(); // TODO
  declare static ctx: AudioContext;
  declare static masterGain: GainNode;
  public static async initialize(config: CelloConfig) {
    this.ctx = new window.AudioContext();
    if (config.preloadSounds) {
      for (const { name, url } of config.preloadSounds) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const decodedData = await this.ctx.decodeAudioData(arrayBuffer);
        this.buffers.set(name, decodedData);
      }
    }
    if (config.categoryTree) {
      this.createCategoryTree(config.categoryTree);
    }
    if (config.effects) {
      for (const [name, strategy] of Object.entries(config.effects)) {
        this.registerEffect(name, strategy);
      }
    }
    this.buildRegisteredEffects();
    window.API.WINDOW.onFocusChanged((value) => {
      value ? this.ctx.resume() : this.ctx.suspend();
    });
    console.log(this.getCategoryPath("ambient"));
  }
  //limiter odglosow oraz pozycyjne wycizzanie
  private static createCategoryTree(tree: Record<string, CategoryTree>) {
    const master = this.ctx.createGain();
    this.categories.set("master", master);
    this.spawnCategories("master", tree);
    master.connect(this.ctx.destination);
  }

  private static spawnCategories(
    parentName: string,
    tree: Record<string, CategoryTree>,
  ) {
    const parent = this.categories.get(parentName)!;
    Object.entries(tree).forEach(([name, props]) => {
      const node = this.ctx.createGain();
      node.gain.value = props.initVol;
      this.categories.set(name, node);
      this.categoryParents.set(name, parentName);
      node.connect(parent);
      if (props.children) {
        this.spawnCategories(name, props.children);
      }
    });
  }
  public static play(name: string, props: PlayObject) {
    const buffer = this.buffers.get(name);
    if (!buffer) {
      console.warn(`No sound with name: ${name}`);
      return undefined;
    }

    if (props.maxConcurrent !== undefined) {
      const active = this.activeCounts.get(name) ?? 0;
      if (active >= props.maxConcurrent) {
        return undefined; // po prostu ignorujemy to wywołanie, cicho
      }
      this.activeCounts.set(name, active + 1);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    source.loop = props.loop ?? false;

    //random pitch to make slightly different sounds
    if (props.randomPitch) {
      const deviation = (Math.random() * 2 - 1) * props.randomPitch;
      source.playbackRate.value = 1 + deviation;
    }

    //individual volume control
    const instanceGain = this.ctx.createGain();
    instanceGain.gain.value = props.volume ?? 1;
    source.connect(instanceGain);

    //effects loop
    let current: AudioNode = instanceGain;
    const perInstanceNodes: AudioNode[] = [];
    if (props.effects) {
      for (const eff of props.effects) {
        const strat = this.effectRegistry.get(eff);
        const effect = this.buildEffect(eff, { position: props.position });
        if (!effect || !strat) continue;
        if (strat.scope === "perInstance") {
          perInstanceNodes.push(effect.input, effect.output);
        }
        current.connect(effect.input);
        current = effect.output;
      }
    }

    //categories loop
    for (const cat of props.categories) {
      const node = this.categories.get(cat);
      if (!node) {
        console.warn(`there is no gain node category with name: ${cat}`);
        continue;
      }
      current.connect(node);
    }

    source.onended = () => {
      source.disconnect();
      perInstanceNodes.forEach((node) => node.disconnect());
      if (props.maxConcurrent !== undefined)
        this.activeCounts.set(name, (this.activeCounts.get(name) ?? 1) - 1);
    };
    source.start(0);

    return {
      stop: () => source.stop(),
      setVolume: (val: number) => {
        instanceGain.gain.value = val;
      },
      fadeOutAndStop: (duration: number) => {
        const now = this.ctx.currentTime;
        instanceGain.gain.linearRampToValueAtTime(0, now + duration);
        source.stop(now + duration);
      },
      sourceNode: source,
    };
  }
  public static registerEffect(name: string, strategy: EffectStrategy) {
    if (this.effectRegistry.has(name)) {
      console.warn(`Effect "${name}" already registered`);
      return;
    }
    this.effectRegistry.set(name, strategy);
  }
  public static overrideEffect(name: string, strategy: EffectStrategy) {
    if (this.effectRegistry.has(name)) {
      console.warn(`overwriting effect: ${name}`);
    }
    this.effectRegistry.set(name, strategy);
  }
  public static buildEffect(
    name: string,
    runtimeArgs?: unknown,
  ): EffectNode | undefined {
    const strategy = this.effectRegistry.get(name);
    if (!strategy) {
      console.warn(`No effect registered with name: ${name}`);
      return undefined;
    }

    if (strategy.scope === "shared") {
      const existing = this.sharedEffects.get(name);
      if (existing) return existing;
      const built = strategy.build(this.ctx);
      this.sharedEffects.set(name, built);
      return built;
    }

    return strategy.build(this.ctx, runtimeArgs);
  }
  public static getEffectNode(name: string): EffectNode | undefined {
    return this.buildEffect(name);
  }
  //call after all builds
  public static buildRegisteredEffects() {
    for (const [name, strategy] of this.effectRegistry) {
      if (strategy.scope !== "shared") continue;
      if (this.sharedEffects.has(name)) continue;
      const built = strategy.build(this.ctx);
      this.sharedEffects.set(name, built);
    }
  }
  public static setMasterVolume(volume: number) {
    this.categories.get("master")!.gain.value = volume;
  }
  public static getMasterVolumeValue() {
    return this.categories.get("master")!.gain.value;
  }
  public static getMasterVolumeNode() {
    return this.categories.get("master")!;
  }
  public static setCategoryVolume(category: string, volume: number) {
    const node = this.categories.get(category);
    if (!node) {
      console.warn(`there is no gain node category with name: ${category}`);
      return;
    }
    node.gain.value = volume;
  }
  public static getCategoryVolumeValue(category: string) {
    const node = this.categories.get(category);
    if (!node) {
      console.warn(`there is no gain node category with name: ${category}`);
      return;
    }
    return node.gain.value;
  }
  public static getCategoryVolumeNode(category: string) {
    const node = this.categories.get(category);
    if (!node) {
      console.warn(`there is no gain node category with name: ${category}`);
      return;
    }
    return node;
  }

  public static getCategoryNames() {
    return this.categories.keys();
  }
  public static getCategoryPath(name: string): string[] {
    if (!this.categoryParents.has(name)) {
      console.warn(
        `getCategoryPath: there is no category in celo with name: ${name}`,
      );
      return [];
    }

    const path: string[] = [name];
    let current = name;
    while (this.categoryParents.has(current)) {
      current = this.categoryParents.get(current)!;
      path.push(current);
    }
    path.push("destination");
    return path;
  }

  public static getAllCategoryPaths(): Record<string, string[]> {
    const paths: Record<string, string[]> = {};
    for (const name of this.categories.keys()) {
      paths[name] = this.getCategoryPath(name);
    }
    return paths;
  }
  public static createNode<K extends keyof NodeTypeMap>(
    type: K,
  ): NodeTypeMap[K] {
    switch (type) {
      case "gain":
        return this.ctx.createGain() as NodeTypeMap[K];
      case "delay":
        return this.ctx.createDelay() as NodeTypeMap[K];
      case "filter":
        return this.ctx.createBiquadFilter() as NodeTypeMap[K];
      case "stereoPan":
        return this.ctx.createStereoPanner() as NodeTypeMap[K];
      case "convolver":
        return this.ctx.createConvolver() as NodeTypeMap[K];
      case "compressor":
        return this.ctx.createDynamicsCompressor() as NodeTypeMap[K];
      case "waveShaper":
        return this.ctx.createWaveShaper() as NodeTypeMap[K];
      case "analyser":
        return this.ctx.createAnalyser() as NodeTypeMap[K];
      case "panner":
        return this.ctx.createPanner() as NodeTypeMap[K];
      default:
        throw new Error(`Unknown node type: ${type}`);
    }
  }
}
