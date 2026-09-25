// gaussian blur of the scene: the 13 tap pyramid down to the level just under sigma, the rest
// as a separable gaussian on that level, read back with a b-spline; standalone on purpose,
// shared code waits for shaders built from pieces
@group(1) @binding(5) var texSampler: sampler;
// the level read by this step: the scene, a pyramid mip or the horizontal pass
@group(2) @binding(0) var source: texture_2d<f32>;
// must match BlurPass.writeParams
struct Blur {
  // center tap, then the three pairs of texels merged into one bilinear tap each
  weights: vec4f,
  // pair distances in texels of the level the gaussian runs on
  offsets: vec3f,
  amount: f32,
  center: vec2f,
  reach: f32,
  smoothness: f32,
  roundness: f32,
  mask: u32,
};
@group(2) @binding(1) var<uniform> blur: Blur;
@group(2) @binding(2) var scene: texture_2d<f32>;

// must match EFFECT_MASK in passes/effectPass.ts
const MASK_VIGNETTE: u32 = 1u;

override horizontal: bool = true;
// sigma below the first level: the composite runs the gaussian on the scene itself
override direct: bool = false;

fn tap(uv: vec2f, texel: vec2f, x: f32, y: f32) -> vec4f {
  return textureSampleLevel(source, texSampler, uv + texel * vec2f(x, y), 0.0);
}

// 13 taps in 5 overlapping 2x2 boxes (Jimenez 2014), no karis: it would dim lone lights and
// the blur must keep the energy; adds 1.75 source texels² of variance (LEVEL_VARIANCE)
fn downsample13(uv: vec2f) -> vec4f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  let a = tap(uv, texel, -2.0, -2.0);
  let b = tap(uv, texel, 0.0, -2.0);
  let c = tap(uv, texel, 2.0, -2.0);
  let d = tap(uv, texel, -2.0, 0.0);
  let e = tap(uv, texel, 0.0, 0.0);
  let f = tap(uv, texel, 2.0, 0.0);
  let g = tap(uv, texel, -2.0, 2.0);
  let h = tap(uv, texel, 0.0, 2.0);
  let i = tap(uv, texel, 2.0, 2.0);
  let j = tap(uv, texel, -1.0, -1.0);
  let k = tap(uv, texel, 1.0, -1.0);
  let l = tap(uv, texel, -1.0, 1.0);
  let m = tap(uv, texel, 1.0, 1.0);
  return e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
}

fn pairTap(uv: vec2f, step: vec2f, offset: f32, weight: f32) -> vec4f {
  return (textureSampleLevel(source, texSampler, uv + step * offset, 0.0)
    + textureSampleLevel(source, texSampler, uv - step * offset, 0.0)) * weight;
}
fn gaussian(uv: vec2f, step: vec2f) -> vec4f {
  var sum = textureSampleLevel(source, texSampler, uv, 0.0) * blur.weights.x;
  sum += pairTap(uv, step, blur.offsets.x, blur.weights.y);
  sum += pairTap(uv, step, blur.offsets.y, blur.weights.z);
  sum += pairTap(uv, step, blur.offsets.z, blur.weights.w);
  return sum;
}
// both axes at once, only for sigmas under the first level; pairs with no weight are skipped
fn gaussian2d(uv: vec2f) -> vec4f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  let offsets = blur.offsets;
  let weights = blur.weights;
  var positions = array<f32, 7>(-offsets.z, -offsets.y, -offsets.x, 0.0, offsets.x, offsets.y, offsets.z);
  var taps = array<f32, 7>(weights.w, weights.z, weights.y, weights.x, weights.y, weights.z, weights.w);
  var sum = vec4f(0.0);
  for (var row = 0; row < 7; row++) {
    if (taps[row] <= 0.0) {
      continue;
    }
    for (var column = 0; column < 7; column++) {
      if (taps[column] <= 0.0) {
        continue;
      }
      let offset = vec2f(positions[column], positions[row]) * texel;
      sum += textureSampleLevel(source, texSampler, uv + offset, 0.0) * taps[row] * taps[column];
    }
  }
  return sum;
}

// cubic b-spline from 4 bilinear taps: a small level stretched with plain bilinear shows
// boxes and diamonds; adds 1/3 texel² of variance (LEVEL_VARIANCE)
fn sampleBicubic(uv: vec2f) -> vec4f {
  let size = vec2f(textureDimensions(source));
  let pixel = uv * size - 0.5;
  let base = floor(pixel);
  let f = pixel - base;
  let f2 = f * f;
  let f3 = f2 * f;
  let w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  let w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  let w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  let w3 = f3 / 6.0;
  // each pair of texels as one bilinear tap placed between them by their weights
  let near = w0 + w1;
  let far = w2 + w3;
  let nearUv = (base - 1.0 + w1 / near + 0.5) / size;
  let farUv = (base + 1.0 + w3 / far + 0.5) / size;
  return textureSampleLevel(source, texSampler, nearUv, 0.0) * near.x * near.y
    + textureSampleLevel(source, texSampler, vec2f(farUv.x, nearUv.y), 0.0) * far.x * near.y
    + textureSampleLevel(source, texSampler, vec2f(nearUv.x, farUv.y), 0.0) * near.x * far.y
    + textureSampleLevel(source, texSampler, farUv, 0.0) * far.x * far.y;
}

// 0 = sharp, 1 = fully blurred; the vignette shape of effectShader.wgsl
fn blurMask(uv: vec2f) -> f32 {
  if (blur.mask != MASK_VIGNETTE) {
    return 1.0;
  }
  let size = vec2f(textureDimensions(scene));
  var offset = abs(uv - blur.center) * blur.reach;
  offset.x *= mix(1.0, size.x / size.y, blur.roundness);
  return 1.0 - pow(saturate(1.0 - dot(offset, offset)), blur.smoothness * 5.0);
}

@fragment
fn fragmentDownsample(in: FullscreenOut) -> @location(0) vec4f {
  return downsample13(in.uv);
}
@fragment
fn fragmentGaussian(in: FullscreenOut) -> @location(0) vec4f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  let step = select(vec2f(0.0, texel.y), vec2f(texel.x, 0.0), horizontal);
  return gaussian(in.uv, step);
}
@fragment
fn fragmentComposite(in: FullscreenOut) -> @location(0) vec4f {
  let color = textureLoad(scene, vec2u(in.position.xy), 0);
  var blurred: vec4f;
  if (direct) {
    blurred = gaussian2d(in.uv);
  } else {
    blurred = sampleBicubic(in.uv);
  }
  // both premultiplied, alpha blurs along with the color
  return mix(color, blurred, blur.amount * blurMask(in.uv));
}
