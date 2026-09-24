@group(1) @binding(5) var texSampler: sampler;
@group(2) @binding(0) var scene: texture_2d<f32>;
@group(2) @binding(1) var lut: texture_3d<f32>;
// must match the layout written in PostPass.writePost; a neutral value switches an effect off
struct Post {
  // 2^exposure, applied before the lut
  exposure: f32,
  useLut: u32,
  // levels per channel, below 2 = off
  posterize: f32,
  // new every frame, moves the grain
  seed: u32,
  blurCenter: vec2f,
  blurStrength: f32,
  blurSamples: u32,
  chromaCenter: vec2f,
  chroma: f32,
  grainIntensity: f32,
  // linear
  vignetteColor: vec3f,
  vignetteIntensity: f32,
  vignetteCenter: vec2f,
  vignetteSmoothness: f32,
  vignetteRoundness: f32,
  // linear
  flashColor: vec3f,
  flashAmount: f32,
  vignetteBlend: u32,
  grainResponse: f32,
  grainSize: f32,
};
@group(2) @binding(2) var<uniform> post: Post;

// must match SCREEN_BLEND in passes/postPass.ts
const BLEND_MULTIPLY: u32 = 0u;
const BLEND_MIX: u32 = 1u;
const BLEND_ADDITIVE: u32 = 2u;
// chroma = 1 shifts red out and blue in by this share of their distance to the center
const CHROMA_REACH: f32 = 0.03;
const LUMA = vec3f(0.2126, 0.7152, 0.0722);

// must match lutDecode in lutBakeShader.wgsl
const LUT_SCALE: f32 = 256.0;
const LUT_MAX: f32 = 64.0;
fn lutEncode(color: vec3f) -> vec3f {
  return log2(1.0 + max(color, vec3f(0.0)) * LUT_SCALE) / log2(1.0 + LUT_MAX * LUT_SCALE);
}
fn sampleLut(color: vec3f) -> vec3f {
  let size = f32(textureDimensions(lut).x);
  // texel centers: 0 and 1 land on the first and last cell, not their outer edges
  let coord = clamp(lutEncode(color), vec3f(0.0), vec3f(1.0)) * (size - 1.0) / size + 0.5 / size;
  return textureSampleLevel(lut, texSampler, coord, 0.0).rgb;
}

fn srgbEncode(color: vec3f) -> vec3f {
  let low = color * 12.92;
  let high = 1.055 * pow(color, vec3f(1.0 / 2.4)) - 0.055;
  return select(high, low, color <= vec3f(0.0031308));
}
fn srgbDecode(color: vec3f) -> vec3f {
  let low = color / 12.92;
  let high = pow((color + 0.055) / 1.055, vec3f(2.4));
  return select(high, low, color <= vec3f(0.04045));
}

// premultiplied samples: averaging them is correct at any alpha
fn sampleScene(uv: vec2f) -> vec4f {
  let center = textureSampleLevel(scene, texSampler, uv, 0.0);
  if (post.chroma == 0.0) {
    return center;
  }
  let offset = (uv - post.chromaCenter) * post.chroma * CHROMA_REACH;
  let red = textureSampleLevel(scene, texSampler, uv + offset, 0.0).r;
  let blue = textureSampleLevel(scene, texSampler, uv - offset, 0.0).b;
  return vec4f(red, center.g, blue, center.a);
}
fn readScene(in: FullscreenOut) -> vec4f {
  if (post.blurStrength == 0.0) {
    if (post.chroma == 0.0) {
      return textureLoad(scene, vec2u(in.position.xy), 0);
    }
    return sampleScene(in.uv);
  }
  // samples from the pixel toward the center: the farther from it, the longer the streak
  let toPixel = in.uv - post.blurCenter;
  var sum = vec4f(0.0);
  for (var index = 0u; index < post.blurSamples; index++) {
    let reach = f32(index) / f32(post.blurSamples - 1u);
    sum += sampleScene(post.blurCenter + toPixel * (1.0 - post.blurStrength * reach));
  }
  return sum / f32(post.blurSamples);
}

// 0 in the middle, 1 where the vignette covers fully; Unity's shape
fn vignetteMask(uv: vec2f) -> f32 {
  let size = vec2f(textureDimensions(scene));
  var reach = abs(uv - post.vignetteCenter) * post.vignetteIntensity;
  reach.x *= mix(1.0, size.x / size.y, post.vignetteRoundness);
  return 1.0 - pow(saturate(1.0 - dot(reach, reach)), post.vignetteSmoothness * 5.0);
}
fn vignette(color: vec3f, uv: vec2f) -> vec3f {
  let mask = vignetteMask(uv);
  switch (post.vignetteBlend) {
    case BLEND_MIX: {
      return mix(color, post.vignetteColor, mask);
    }
    case BLEND_ADDITIVE: {
      return color + post.vignetteColor * mask;
    }
    default: {
      return color * mix(vec3f(1.0), post.vignetteColor, mask);
    }
  }
}

// pcg hash: integer, so the grain has no pattern and no precision loss over time
fn hash(value: u32) -> u32 {
  let state = value * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
fn grainNoise(pixel: vec2f) -> f32 {
  let cell = vec2u(pixel / max(post.grainSize, 1.0));
  let bits = hash(cell.x ^ hash(cell.y ^ hash(post.seed)));
  // two uniform values summed: triangular, -1..1, softer than flat noise
  let first = f32(bits & 0xffffu) / 65535.0;
  let second = f32(bits >> 16u) / 65535.0;
  return first + second - 1.0;
}
// multiplied, so black stays black; bright areas hide it through response
fn grain(color: vec3f, pixel: vec2f) -> vec3f {
  let luma = sqrt(dot(saturate(color), LUMA));
  let visible = mix(1.0, 1.0 - luma, post.grainResponse);
  return max(color + color * grainNoise(pixel) * post.grainIntensity * visible, vec3f(0.0));
}

@fragment
fn fragmentMain(in: FullscreenOut) -> @location(0) vec4f {
  let color = readScene(in);
  if (color.a <= 0.0) {
    return color;
  }
  // premultiplied: everything runs on straight color, coverage is put back after
  var straight = color.rgb / color.a * post.exposure;
  if (post.useLut != 0u) {
    straight = sampleLut(straight);
  }
  if (post.posterize >= 2.0) {
    // on the display encoding, linear steps would crowd the shadows into one level
    let steps = post.posterize - 1.0;
    straight = srgbDecode(round(saturate(srgbEncode(straight)) * steps) / steps);
  }
  if (post.vignetteIntensity != 0.0) {
    straight = vignette(straight, in.uv);
  }
  straight = mix(straight, post.flashColor, post.flashAmount);
  if (post.grainIntensity != 0.0) {
    straight = grain(straight, in.position.xy);
  }
  return vec4f(straight * color.a, color.a);
}
