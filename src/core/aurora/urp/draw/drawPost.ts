import type {
  AgxLook,
  BloomProps,
  ChromaticAberration,
  ColorGrading,
  DiffusionProps,
  EffectLayer,
  EffectStage,
  FilmGrain,
  Flash,
  FlashOptions,
  MaterialParams,
  RadialBlur,
  ToneMapMode,
  Vignette,
} from "./drawTypes";
import Easing from "@axiom/easing";

// an EffectLayer with every default filled in and its own copies of arrays and points
export type ResolvedLayer = Required<EffectLayer> & { params: MaterialParams };
export const EFFECT_LAYER_DEFAULTS = Object.freeze({
  intensity: 1,
  blend: "mix",
  color: [255, 255, 255, 255],
  mask: "full",
  reach: 1,
  smoothness: 0.5,
  roundness: 1,
  center: { x: 0.5, y: 0.5 },
} satisfies Omit<Required<EffectLayer>, "effect" | "params">);
interface PostEffects {
  radialBlur: RadialBlur;
  chroma: ChromaticAberration;
  // levels per channel, below 2 = off
  posterize: number;
  vignette: Vignette;
  flash: Flash;
  grain: FilmGrain;
}

// off by default, so existing scenes keep their look
export const BLOOM_DEFAULTS: Readonly<BloomProps> = Object.freeze({
  enabled: false,
  threshold: 1,
  knee: 0.5,
  intensity: 0.5,
  scatter: 0.7,
  // every level of BloomPass
  radius: 8,
});
export const DIFFUSION_DEFAULTS = Object.freeze<DiffusionProps>({
  amount: 0,
  radius: 5,
  haze: 0,
  hazeColor: [255, 255, 255, 255],
});
// typed on freeze, otherwise filter is inferred as number[] instead of RGBA
export const COLOR_DEFAULTS = Object.freeze<ColorGrading>({
  brightness: 1,
  contrast: 1,
  saturation: 1,
  temperature: 0,
  tint: 0,
  hueShift: 0,
  filter: [255, 255, 255, 255],
  sepia: 0,
  invert: 0,
});
export const EFFECT_DEFAULTS = Object.freeze<PostEffects>({
  radialBlur: { strength: 0, center: { x: 0.5, y: 0.5 }, samples: 12 },
  chroma: { intensity: 0, center: { x: 0.5, y: 0.5 } },
  posterize: 0,
  vignette: {
    intensity: 0,
    smoothness: 0.5,
    roundness: 1,
    center: { x: 0.5, y: 0.5 },
    color: [0, 0, 0, 255],
    blend: "multiply",
  },
  flash: { color: [255, 255, 255, 255], amount: 0 },
  grain: { intensity: 0, response: 0.8, size: 1 },
});

// post effect state, set every frame or once; it lives here so rebuilds keep it,
// URP.init writes its start values
export class PostDraw {
  private readonly bloom: BloomProps = { ...BLOOM_DEFAULTS };
  private readonly diffusion: DiffusionProps = {
    ...DIFFUSION_DEFAULTS,
    hazeColor: [...DIFFUSION_DEFAULTS.hazeColor],
  };
  private readonly color: ColorGrading = {
    ...COLOR_DEFAULTS,
    filter: [...COLOR_DEFAULTS.filter],
  };
  private toneMapping: ToneMapMode = "none";
  // stops, the scene is scaled by 2^exposure before the curve
  private exposure = 0;
  private agxLook: AgxLook = "none";
  // bumped by everything baked into the lut, PostPass rebakes when it differs
  private lutVersion = 0;
  private colorGraded = false;
  private readonly effects: PostEffects = structuredClone(EFFECT_DEFAULTS);
  private readonly effectLayers: Record<EffectStage, ResolvedLayer[]> = {
    world: [],
    hdr: [],
    screen: [],
  };
  // the running flash(), null = the flash holds what setFlash gave it
  private flashCurve: {
    elapsed: number;
    rise: number;
    duration: number;
    peak: number;
  } | null = null;

  public get getBloom(): Readonly<BloomProps> {
    return this.bloom;
  }
  public get getDiffusion(): Readonly<DiffusionProps> {
    return this.diffusion;
  }
  public get getColor(): Readonly<ColorGrading> {
    return this.color;
  }
  public get getToneMapping() {
    return this.toneMapping;
  }
  public get getExposure() {
    return this.exposure;
  }
  public get getAgxLook() {
    return this.agxLook;
  }
  public get getLutVersion() {
    return this.lutVersion;
  }
  public getEffectLayers(stage: EffectStage): readonly ResolvedLayer[] {
    return this.effectLayers[stage];
  }
  public get getEffects(): Readonly<PostEffects> {
    return this.effects;
  }
  // with the curve off and neutral grading the lut would change nothing
  public get usesLut() {
    return this.toneMapping !== "none" || this.colorGraded;
  }
  public get hasEffects() {
    const effects = this.effects;
    return (
      effects.radialBlur.strength !== 0 ||
      effects.chroma.intensity !== 0 ||
      effects.posterize >= 2 ||
      effects.vignette.intensity !== 0 ||
      effects.flash.amount > 0 ||
      effects.grain.intensity !== 0
    );
  }

  public setBloom(props: Partial<BloomProps>) {
    Object.assign(this.bloom, props);
  }
  // replaces the stage's list, run in order: each layer sees the result of the one before;
  // an empty list takes the stage out of the frame
  public setEffects(stage: EffectStage, layers: readonly EffectLayer[]) {
    this.effectLayers[stage] = layers.map((layer) => {
      const defaults = EFFECT_LAYER_DEFAULTS;
      return {
        ...defaults,
        ...layer,
        params: layer.params ? [...layer.params] : [...layer.effect.defaults],
        color: [...(layer.color ?? defaults.color)],
        center: { ...(layer.center ?? defaults.center) },
      };
    });
  }
  public setDiffusion(props: Partial<DiffusionProps>) {
    Object.assign(this.diffusion, props);
    if (props.hazeColor) this.diffusion.hazeColor = [...props.hazeColor];
  }
  public setExposure(stops: number) {
    this.exposure = stops;
  }
  // live, the curve is baked into the lut
  public setToneMapping(mode: ToneMapMode) {
    if (mode === this.toneMapping) return;
    this.toneMapping = mode;
    this.lutVersion++;
  }
  // only changes the "agx" tone mapping, the other curves ignore it
  public setAgxLook(look: AgxLook) {
    if (look === this.agxLook) return;
    this.agxLook = look;
    this.lutVersion++;
  }
  public setColor(props: Partial<ColorGrading>) {
    Object.assign(this.color, props);
    if (props.filter) this.color.filter = [...props.filter];
    this.colorGraded = !isNeutralColor(this.color);
    this.lutVersion++;
  }
  public setRadialBlur(props: Partial<RadialBlur>) {
    const blur = this.effects.radialBlur;
    Object.assign(blur, props);
    if (props.center) blur.center = { ...props.center };
  }
  public setChroma(props: Partial<ChromaticAberration>) {
    const chroma = this.effects.chroma;
    Object.assign(chroma, props);
    if (props.center) chroma.center = { ...props.center };
  }
  public setPosterize(levels: number) {
    this.effects.posterize = levels;
  }
  // pulsing = a new intensity every frame, nothing is rebaked
  public setVignette(props: Partial<Vignette>) {
    const vignette = this.effects.vignette;
    Object.assign(vignette, props);
    if (props.center) vignette.center = { ...props.center };
    if (props.color) vignette.color = [...props.color];
  }
  // rises to amount over rise seconds, then fades to 0 over duration; game time (stops on pause)
  public flash(
    color: Readonly<RGBA>,
    duration: number,
    { amount = 1, rise = 0 }: FlashOptions = {},
  ) {
    this.effects.flash = { color: [...color], amount: rise > 0 ? 0 : amount };
    this.flashCurve = { elapsed: 0, rise, duration, peak: amount };
  }
  // held as set, cancels the fade of flash()
  public setFlash(props: Partial<Flash>) {
    const flash = this.effects.flash;
    Object.assign(flash, props);
    if (props.color) flash.color = [...props.color];
    this.flashCurve = null;
  }
  public setGrain(props: Partial<FilmGrain>) {
    Object.assign(this.effects.grain, props);
  }
  // once per frame from PostPass.clearFrame
  public tick(deltaSeconds: number) {
    const curve = this.flashCurve;
    if (!curve) return;
    curve.elapsed += deltaSeconds;
    const flash = this.effects.flash;
    // ease out both ways: a quick rise that settles, a fade with a soft tail instead of a cut
    if (curve.elapsed < curve.rise) {
      flash.amount = curve.peak * Easing.easeOutQuad(curve.elapsed / curve.rise);
      return;
    }
    const fade = curve.duration > 0 ? (curve.elapsed - curve.rise) / curve.duration : 1;
    if (fade >= 1) {
      flash.amount = 0;
      this.flashCurve = null;
      return;
    }
    flash.amount = curve.peak * (1 - Easing.easeOutQuad(fade));
  }
}

function isNeutralColor(color: Readonly<ColorGrading>) {
  const defaults = COLOR_DEFAULTS;
  return (
    color.brightness === defaults.brightness &&
    color.contrast === defaults.contrast &&
    color.saturation === defaults.saturation &&
    color.temperature === defaults.temperature &&
    color.tint === defaults.tint &&
    color.hueShift % 360 === 0 &&
    color.sepia === defaults.sepia &&
    color.invert === defaults.invert &&
    color.filter[0] === 255 &&
    color.filter[1] === 255 &&
    color.filter[2] === 255
  );
}

// the instance the post passes read, games get it narrowed from draw.ts
export const postDraw = new PostDraw();
