// bloom after Jimenez (Next Generation Post Processing in Call of Duty: AW, 2014):
// bright pass, 13 tap downsample chain, tent upsample chain added back up, composite
@group(1) @binding(5) var texSampler: sampler;
// the level read by this step: the scene for the bright pass, a pyramid mip otherwise
@group(2) @binding(0) var source: texture_2d<f32>;
// must match BloomPass.writeParams
struct Bloom {
  threshold: f32,
  // absolute: threshold * knee
  knee: f32,
  intensity: f32,
};
@group(2) @binding(1) var<uniform> bloom: Bloom;
@group(2) @binding(2) var scene: texture_2d<f32>;

fn luma(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}
fn tap(uv: vec2f, texel: vec2f, x: f32, y: f32) -> vec3f {
  return textureSampleLevel(source, texSampler, uv + texel * vec2f(x, y), 0.0).rgb;
}

// 13 taps in 5 overlapping 2x2 boxes, named a..m like the tap layout in the paper;
// karis weighs each box by 1 / (1 + luma), a lone very bright pixel would otherwise
// flicker as it moves between texels
fn downsample13(uv: vec2f, karis: bool) -> vec3f {
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
  let center = (j + k + l + m) * 0.25;
  let topLeft = (a + b + d + e) * 0.25;
  let topRight = (b + c + e + f) * 0.25;
  let bottomLeft = (d + e + g + h) * 0.25;
  let bottomRight = (e + f + h + i) * 0.25;
  if (!karis) {
    return center * 0.5 + (topLeft + topRight + bottomLeft + bottomRight) * 0.125;
  }
  let wCenter = 0.5 / (1.0 + luma(center));
  let wTopLeft = 0.125 / (1.0 + luma(topLeft));
  let wTopRight = 0.125 / (1.0 + luma(topRight));
  let wBottomLeft = 0.125 / (1.0 + luma(bottomLeft));
  let wBottomRight = 0.125 / (1.0 + luma(bottomRight));
  let sum = center * wCenter + topLeft * wTopLeft + topRight * wTopRight
    + bottomLeft * wBottomLeft + bottomRight * wBottomRight;
  return sum / (wCenter + wTopLeft + wTopRight + wBottomLeft + wBottomRight);
}
// 3x3 tent over the smaller level: no blocky texels when it is stretched up
fn upsampleTent(uv: vec2f) -> vec3f {
  let texel = 1.0 / vec2f(textureDimensions(source));
  var sum = tap(uv, texel, 0.0, 0.0) * 4.0;
  sum += (tap(uv, texel, 0.0, -1.0) + tap(uv, texel, -1.0, 0.0)
    + tap(uv, texel, 1.0, 0.0) + tap(uv, texel, 0.0, 1.0)) * 2.0;
  sum += tap(uv, texel, -1.0, -1.0) + tap(uv, texel, 1.0, -1.0)
    + tap(uv, texel, -1.0, 1.0) + tap(uv, texel, 1.0, 1.0);
  return sum / 16.0;
}
// soft knee on the brightest channel: saturated blue glows like white of the same
// strength, a luma threshold would barely let it through
fn brightPass(color: vec3f) -> vec3f {
  let brightness = max(color.r, max(color.g, color.b));
  var soft = clamp(brightness - bloom.threshold + bloom.knee, 0.0, 2.0 * bloom.knee);
  soft = soft * soft / (4.0 * bloom.knee + 0.00001);
  let contribution = max(soft, brightness - bloom.threshold) / max(brightness, 0.00001);
  return color * contribution;
}

@fragment
fn fragmentPrefilter(in: FullscreenOut) -> @location(0) vec4f {
  return vec4f(brightPass(downsample13(in.uv, true)), 1.0);
}
@fragment
fn fragmentDownsample(in: FullscreenOut) -> @location(0) vec4f {
  return vec4f(downsample13(in.uv, false), 1.0);
}
// blended as lerp(own downsample, this, scatter) through the blend constant
@fragment
fn fragmentUpsample(in: FullscreenOut) -> @location(0) vec4f {
  return vec4f(upsampleTent(in.uv), 1.0);
}
@fragment
fn fragmentComposite(in: FullscreenOut) -> @location(0) vec4f {
  let color = textureLoad(scene, vec2u(in.position.xy), 0);
  // premultiplied, glow is light: it adds to rgb, coverage stays
  return vec4f(color.rgb + upsampleTent(in.uv) * bloom.intensity, color.a);
}
