// wraps one ScreenEffect: the game's fn effect() is put in place of the EFFECT line below.
// Frame, Camera and the noise are copies, cleaned up when shaders are built from pieces
struct Frame {
  time: f32,
  realTime: f32,
  delta: f32,
  realDelta: f32,
  renderSize: vec2f,
  canvasSize: vec2f,
  frame: u32,
};
struct Camera {
  position: vec2f,
  zoom: f32,
  rotation: f32,
};
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<uniform> camera: Camera;
@group(1) @binding(5) var texSampler: sampler;
@group(2) @binding(0) var source: texture_2d<f32>;
// must match EffectPass.writeLayer
struct Layer {
  // linear
  color: vec3f,
  intensity: f32,
  params: vec4f,
  center: vec2f,
  smoothness: f32,
  roundness: f32,
  reach: f32,
  mask: u32,
  blend: u32,
  // only the "world" stage reads the light map, the others bind a stand-in
  useLight: u32,
};
@group(2) @binding(1) var<uniform> layer: Layer;
@group(2) @binding(2) var lightMap: texture_2d<f32>;

// must match SCREEN_BLEND in passes/postPass.ts
const BLEND_MULTIPLY: u32 = 0u;
const BLEND_MIX: u32 = 1u;
const BLEND_ADDITIVE: u32 = 2u;
// must match EFFECT_MASK in passes/effectPass.ts
const MASK_FULL: u32 = 0u;
const MASK_VIGNETTE: u32 = 1u;

struct EffectInput {
  // 0..1 of the screen, top left is 0,0
  uv: vec2f,
  // render pixels
  pixel: vec2f,
  // world units under the pixel, through the camera
  world: vec2f,
  // width / height
  aspect: f32,
  // 1 for "full", 0..1 toward the edges for "vignette"
  mask: f32,
  // straight linear color of the scene here, after the layers before this one
  scene: vec3f,
  // the light map here in the "world" stage, 1 elsewhere
  light: vec3f,
  // Post.setEffects color, linear
  color: vec3f,
  // game time in seconds, wraps every hour
  time: f32,
  params: vec4f,
};

// value noise and fbm for effects: 0..1, smooth, no texture needed
fn effectHash(point: vec2f) -> f32 {
  return fract(sin(dot(point, vec2f(127.1, 311.7))) * 43758.5453);
}
fn valueNoise(point: vec2f) -> f32 {
  let cell = floor(point);
  let local = fract(point);
  let fade = local * local * (3.0 - 2.0 * local);
  let a = effectHash(cell);
  let b = effectHash(cell + vec2f(1.0, 0.0));
  let c = effectHash(cell + vec2f(0.0, 1.0));
  let d = effectHash(cell + vec2f(1.0, 1.0));
  return mix(mix(a, b, fade.x), mix(c, d, fade.x), fade.y);
}
// 5 octaves, each twice as fine and half as strong
fn fbm(point: vec2f) -> f32 {
  var sum = 0.0;
  var weight = 0.5;
  var position = point;
  for (var octave = 0; octave < 5; octave++) {
    sum += valueNoise(position) * weight;
    position = position * 2.0 + vec2f(17.3, 9.1);
    weight *= 0.5;
  }
  return sum / 0.96875;
}

// EFFECT

// inverse of worldToPixel in drawWorldShader.wgsl, without its texel snapping
fn pixelToWorld(pixel: vec2f) -> vec2f {
  let center = floor(frame.renderSize * 0.5);
  var relative = pixel - center;
  if (camera.rotation != 0.0) {
    let c = cos(camera.rotation);
    let s = sin(camera.rotation);
    relative = vec2f(relative.x * c + relative.y * s, -relative.x * s + relative.y * c);
  }
  return relative / camera.zoom + camera.position + center;
}
// the shape of the built-in vignette (Unity's), reach instead of its intensity
fn vignetteMask(uv: vec2f, aspect: f32) -> f32 {
  var offset = abs(uv - layer.center) * layer.reach;
  offset.x *= mix(1.0, aspect, layer.roundness);
  return 1.0 - pow(saturate(1.0 - dot(offset, offset)), layer.smoothness * 5.0);
}

@fragment
fn fragmentMain(in: FullscreenOut) -> @location(0) vec4f {
  let color = textureLoad(source, vec2u(in.position.xy), 0);
  if (color.a <= 0.0) {
    return color;
  }
  let size = vec2f(textureDimensions(source));
  let aspect = size.x / size.y;
  var mask = 1.0;
  if (layer.mask == MASK_VIGNETTE) {
    mask = vignetteMask(in.uv, aspect);
    // the middle stays untouched, the effect is not run there at all
    if (mask <= 0.0) {
      return color;
    }
  }

  let straight = color.rgb / color.a;
  var input: EffectInput;
  input.uv = in.uv;
  input.pixel = in.position.xy;
  input.world = pixelToWorld(in.position.xy);
  input.aspect = aspect;
  input.mask = mask;
  input.scene = straight;
  input.light = vec3f(1.0);
  if (layer.useLight != 0u) {
    input.light = textureLoad(lightMap, vec2u(in.position.xy), 0).rgb;
  }
  input.color = layer.color;
  input.time = frame.time;
  input.params = layer.params;
  let result = effect(input);

  let weight = saturate(mask * result.a * layer.intensity);
  var blended: vec3f;
  switch (layer.blend) {
    case BLEND_MULTIPLY: {
      blended = straight * mix(vec3f(1.0), result.rgb, weight);
    }
    case BLEND_ADDITIVE: {
      blended = straight + result.rgb * weight;
    }
    default: {
      blended = mix(straight, result.rgb, weight);
    }
  }
  return vec4f(blended * color.a, color.a);
}
